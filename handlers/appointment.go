
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"practo-clone/config"
	"practo-clone/models"
)

// RegisterAppointmentRoutes registers all appointment related routes
func RegisterAppointmentRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	appointmentRouter := router.PathPrefix("/api/appointments").Subrouter()

	// Register the routes
	appointmentRouter.HandleFunc("", createAppointmentHandler(client, awsConfig)).Methods("POST")
	appointmentRouter.HandleFunc("", getAppointmentsHandler(client)).Methods("GET")
	appointmentRouter.HandleFunc("/{id}", getAppointmentHandler(client)).Methods("GET")
	appointmentRouter.HandleFunc("/{id}", updateAppointmentHandler(client, awsConfig)).Methods("PUT")
	appointmentRouter.HandleFunc("/{id}/cancel", cancelAppointmentHandler(client, awsConfig)).Methods("POST")
}

// createAppointmentHandler creates a new appointment
func createAppointmentHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get user ID from context (set by auth middleware)
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "patient" {
			http.Error(w, "Only patients can book appointments", http.StatusForbidden)
			return
		}

		var appointmentReq models.AppointmentRequest
		err = json.NewDecoder(r.Body).Decode(&appointmentReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if appointmentReq.DoctorID == "" || appointmentReq.ScheduledAt.IsZero() {
			http.Error(w, "Doctor ID and scheduled time are required", http.StatusBadRequest)
			return
		}

		// Convert doctor ID to ObjectID
		doctorID, err := primitive.ObjectIDFromHex(appointmentReq.DoctorID)
		if err != nil {
			http.Error(w, "Invalid doctor ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Check if the doctor exists and is verified
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{
			"_id":        doctorID,
			"isVerified": true,
		}).Decode(&doctorProfile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Doctor not found or not verified", http.StatusNotFound)
			} else {
				log.Printf("Error finding doctor: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if the appointment time is available
		appointmentsCollection := config.GetCollection(client, "appointments")
		
		// Create a 15-minute window around the scheduled time
		startWindow := appointmentReq.ScheduledAt.Add(-15 * time.Minute)
		endWindow := appointmentReq.ScheduledAt.Add(appointmentReq.Duration*time.Minute + 15*time.Minute)
		
		// Check for overlapping appointments
		overlappingFilter := bson.M{
			"doctorId": doctorID,
			"status":   bson.M{"$nin": []string{"cancelled"}},
			"$or": []bson.M{
				{
					"scheduledAt": bson.M{
						"$gte": startWindow,
						"$lt":  endWindow,
					},
				},
				{
					"endTime": bson.M{
						"$gt":  startWindow,
						"$lte": endWindow,
					},
				},
			},
		}
		
		count, err := appointmentsCollection.CountDocuments(ctx, overlappingFilter)
		if err != nil {
			log.Printf("Error checking appointment availability: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		
		if count > 0 {
			http.Error(w, "The selected time slot is not available", http.StatusConflict)
			return
		}

		// Get user profile for the doctor
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var doctorUserProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": doctorProfile.UserID}).Decode(&doctorUserProfile)
		if err != nil {
			log.Printf("Error finding doctor user profile: %v", err)
			// Continue without doctor name
		}

		// Create a new appointment
		duration := appointmentReq.Duration
		if duration == 0 {
			duration = 30 // Default to 30 minutes
		}

		endTime := appointmentReq.ScheduledAt.Add(time.Duration(duration) * time.Minute)
		now := time.Now()

		newAppointment := models.Appointment{
			ID:             primitive.NewObjectID(),
			PatientID:      userID,
			DoctorID:       doctorID,
			ScheduledAt:    appointmentReq.ScheduledAt,
			EndTime:        endTime,
			Duration:       duration,
			Status:         "pending",
			PaymentStatus:  "pending",
			Mode:           appointmentReq.Mode,
			IsSecondOpinion: appointmentReq.IsSecondOpinion,
			Notes:          appointmentReq.Notes,
			CreatedAt:      now,
			UpdatedAt:      now,
		}

		// Insert appointment into database
		_, err = appointmentsCollection.InsertOne(ctx, newAppointment)
		if err != nil {
			log.Printf("Error creating appointment: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send notification to doctor
		if doctorProfile.UserID != primitive.NilObjectID {
			// Get user auth for the doctor
			usersCollection := config.GetCollection(client, "users_auth")
			var doctorUser models.User
			err = usersCollection.FindOne(ctx, bson.M{"_id": doctorProfile.UserID}).Decode(&doctorUser)
			if err == nil && doctorUser.Email != "" {
				// Send email notification
				subject := "New Appointment Request"
				htmlBody := "<p>You have a new appointment request from a patient on " + 
					appointmentReq.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + ".</p>" +
					"<p>Please log in to the platform to confirm or reschedule.</p>"
				textBody := "You have a new appointment request from a patient on " + 
					appointmentReq.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + ".\n" +
					"Please log in to the platform to confirm or reschedule."
				
				err = awsConfig.SendEmail(doctorUser.Email, subject, htmlBody, textBody)
				if err != nil {
					log.Printf("Error sending email notification: %v", err)
					// Continue despite email sending failure
				}

				// Send SMS notification if phone available
				if doctorUser.Phone != "" {
					message := "New appointment request on " + appointmentReq.ScheduledAt.Format("Jan 2 at 3:04 PM") + ". Log in to confirm."
					err = awsConfig.SendSMS(doctorUser.Phone, message)
					if err != nil {
						log.Printf("Error sending SMS notification: %v", err)
						// Continue despite SMS sending failure
					}
				}
			}
		}

		// Return the appointment ID
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"appointmentId": newAppointment.ID.Hex(),
			"message":      "Appointment created successfully",
		})
	}
}

// getAppointmentsHandler returns a list of appointments for the current user
func getAppointmentsHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get user ID from context (set by auth middleware)
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Create filter based on user role
		var filter bson.M
		if userRole == "patient" {
			filter = bson.M{"patientId": userID}
		} else if userRole == "doctor" {
			filter = bson.M{"doctorId": userID}
		} else {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse query parameters
		query := r.URL.Query()
		if status := query.Get("status"); status != "" {
			filter["status"] = status
		}
		
		if mode := query.Get("mode"); mode != "" {
			filter["mode"] = mode
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get appointments
		appointmentsCollection := config.GetCollection(client, "appointments")
		opts := options.Find().SetSort(bson.D{{Key: "scheduledAt", Value: -1}})
		cursor, err := appointmentsCollection.Find(ctx, filter, opts)
		if err != nil {
			log.Printf("Error finding appointments: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var appointments []models.Appointment
		if err = cursor.All(ctx, &appointments); err != nil {
			log.Printf("Error decoding appointments: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get all doctor and patient IDs
		var doctorIDs []primitive.ObjectID
		var patientIDs []primitive.ObjectID
		for _, appointment := range appointments {
			doctorIDs = append(doctorIDs, appointment.DoctorID)
			patientIDs = append(patientIDs, appointment.PatientID)
		}

		// Get doctor profiles
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		doctorFilter := bson.M{"_id": bson.M{"$in": doctorIDs}}
		doctorCursor, err := doctorProfilesCollection.Find(ctx, doctorFilter)
		if err != nil {
			log.Printf("Error finding doctor profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer doctorCursor.Close(ctx)

		var doctorProfiles []models.DoctorProfile
		if err = doctorCursor.All(ctx, &doctorProfiles); err != nil {
			log.Printf("Error decoding doctor profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create a map of doctor IDs to doctor profiles
		doctorProfileMap := make(map[primitive.ObjectID]models.DoctorProfile)
		for _, profile := range doctorProfiles {
			doctorProfileMap[profile.ID] = profile
		}

		// Get all user IDs from doctor profiles
		var userIDs []primitive.ObjectID
		for _, profile := range doctorProfiles {
			userIDs = append(userIDs, profile.UserID)
		}

		// Add patient IDs to user IDs list
		userIDs = append(userIDs, patientIDs...)

		// Get user profiles
		userProfilesCollection := config.GetCollection(client, "users_profile")
		userFilter := bson.M{"userId": bson.M{"$in": userIDs}}
		userCursor, err := userProfilesCollection.Find(ctx, userFilter)
		if err != nil {
			log.Printf("Error finding user profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer userCursor.Close(ctx)

		var userProfiles []models.UserProfile
		if err = userCursor.All(ctx, &userProfiles); err != nil {
			log.Printf("Error decoding user profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create a map of user IDs to user profiles
		userProfileMap := make(map[primitive.ObjectID]models.UserProfile)
		for _, profile := range userProfiles {
			userProfileMap[profile.UserID] = profile
		}

		// Create response
		var response []models.AppointmentResponse
		for _, appointment := range appointments {
			doctorProfile, ok := doctorProfileMap[appointment.DoctorID]
			if !ok {
				continue
			}

			var doctorName string
			doctorUserProfile, ok := userProfileMap[doctorProfile.UserID]
			if ok {
				doctorName = doctorUserProfile.FullName
			}

			var patientName string
			patientProfile, ok := userProfileMap[appointment.PatientID]
			if ok {
				patientName = patientProfile.FullName
			}

			response = append(response, models.AppointmentResponse{
				ID:                appointment.ID,
				PatientID:         appointment.PatientID,
				DoctorID:          appointment.DoctorID,
				PatientName:       patientName,
				DoctorName:        doctorName,
				DoctorSpecialties: doctorProfile.Specialties,
				ScheduledAt:       appointment.ScheduledAt,
				EndTime:           appointment.EndTime,
				Duration:          appointment.Duration,
				Status:            appointment.Status,
				PaymentStatus:     appointment.PaymentStatus,
				Mode:              appointment.Mode,
				IsSecondOpinion:   appointment.IsSecondOpinion,
				Notes:             appointment.Notes,
				Amount:            doctorProfile.ConsultationFee,
				CreatedAt:         appointment.CreatedAt,
			})
		}

		// Return the appointments
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"appointments": response,
		})
	}
}

// getAppointmentHandler returns a single appointment by ID
func getAppointmentHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
			return
		}

		// Get user ID from context (set by auth middleware)
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get appointment
		appointmentsCollection := config.GetCollection(client, "appointments")
		var appointment models.Appointment
		err = appointmentsCollection.FindOne(ctx, bson.M{"_id": appointmentID}).Decode(&appointment)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Appointment not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding appointment: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if user is authorized to view this appointment
		if userRole == "patient" && appointment.PatientID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else if userRole == "doctor" && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Get doctor profile
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{"_id": appointment.DoctorID}).Decode(&doctorProfile)
		if err != nil {
			log.Printf("Error finding doctor profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get user profiles for doctor and patient
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var doctorUserProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": doctorProfile.UserID}).Decode(&doctorUserProfile)
		if err != nil {
			log.Printf("Error finding doctor user profile: %v", err)
			// Continue without doctor name
		}

		var patientProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": appointment.PatientID}).Decode(&patientProfile)
		if err != nil {
			log.Printf("Error finding patient profile: %v", err)
			// Continue without patient name
		}

		// Create response
		response := models.AppointmentResponse{
			ID:                appointment.ID,
			PatientID:         appointment.PatientID,
			DoctorID:          appointment.DoctorID,
			PatientName:       patientProfile.FullName,
			DoctorName:        doctorUserProfile.FullName,
			DoctorSpecialties: doctorProfile.Specialties,
			ScheduledAt:       appointment.ScheduledAt,
			EndTime:           appointment.EndTime,
			Duration:          appointment.Duration,
			Status:            appointment.Status,
			PaymentStatus:     appointment.PaymentStatus,
			Mode:              appointment.Mode,
			IsSecondOpinion:   appointment.IsSecondOpinion,
			Notes:             appointment.Notes,
			Amount:            doctorProfile.ConsultationFee,
			CreatedAt:         appointment.CreatedAt,
		}

		// Return the appointment
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// updateAppointmentHandler updates an appointment
func updateAppointmentHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
			return
		}

		// Get user ID and role from context
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse request body
		var updateReq map[string]interface{}
		err = json.NewDecoder(r.Body).Decode(&updateReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the appointment
		appointmentsCollection := config.GetCollection(client, "appointments")
		var appointment models.Appointment
		err = appointmentsCollection.FindOne(ctx, bson.M{"_id": appointmentID}).Decode(&appointment)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Appointment not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding appointment: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check authorization
		if userRole == "patient" && appointment.PatientID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else if userRole == "doctor" && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Create update document
		update := bson.M{
			"$set": bson.M{
				"updatedAt": time.Now(),
			},
		}

		// Add fields based on role
		if userRole == "doctor" {
			// Doctors can update status and add notes
			if status, ok := updateReq["status"].(string); ok {
				update["$set"].(bson.M)["status"] = status
			}
			if notes, ok := updateReq["notes"].(string); ok {
				update["$set"].(bson.M)["notes"] = notes
			}
		} else if userRole == "patient" {
			// Patients can update notes only
			if notes, ok := updateReq["notes"].(string); ok {
				update["$set"].(bson.M)["notes"] = notes
			}
		}

		// Update appointment
		_, err = appointmentsCollection.UpdateOne(ctx, bson.M{"_id": appointmentID}, update)
		if err != nil {
			log.Printf("Error updating appointment: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send notification if status changed
		if status, ok := updateReq["status"].(string); ok && status != appointment.Status {
			var recipientID primitive.ObjectID
			var recipientRole string
			
			if userRole == "doctor" {
				recipientID = appointment.PatientID
				recipientRole = "patient"
			} else {
				recipientID = appointment.DoctorID
				recipientRole = "doctor"
			}
			
			// Get recipient user
			usersCollection := config.GetCollection(client, "users_auth")
			var recipient models.User
			err = usersCollection.FindOne(ctx, bson.M{"_id": recipientID}).Decode(&recipient)
			if err == nil && recipient.Email != "" {
				// Send email notification
				subject := "Appointment Status Update"
				htmlBody := "<p>Your appointment scheduled for " + 
					appointment.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + 
					" has been updated to: " + status + ".</p>" +
					"<p>Please log in to the platform for more details.</p>"
				textBody := "Your appointment scheduled for " + 
					appointment.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + 
					" has been updated to: " + status + ".\n" +
					"Please log in to the platform for more details."
				
				err = awsConfig.SendEmail(recipient.Email, subject, htmlBody, textBody)
				if err != nil {
					log.Printf("Error sending email notification: %v", err)
					// Continue despite email sending failure
				}

				// Send SMS notification if phone available
				if recipient.Phone != "" {
					message := "Appointment on " + appointment.ScheduledAt.Format("Jan 2 at 3:04 PM") + 
						" is now " + status + ". Log in for details."
					err = awsConfig.SendSMS(recipient.Phone, message)
					if err != nil {
						log.Printf("Error sending SMS notification: %v", err)
						// Continue despite SMS sending failure
					}
				}
			}
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Appointment updated successfully"}`))
	}
}

// cancelAppointmentHandler cancels an appointment
func cancelAppointmentHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
			return
		}

		// Get user ID and role from context
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse request body to get cancellation reason
		var cancelReq struct {
			Reason string `json:"reason"`
		}
		err = json.NewDecoder(r.Body).Decode(&cancelReq)
		if err != nil {
			// Continue without reason if body can't be parsed
			cancelReq.Reason = ""
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the appointment
		appointmentsCollection := config.GetCollection(client, "appointments")
		var appointment models.Appointment
		err = appointmentsCollection.FindOne(ctx, bson.M{"_id": appointmentID}).Decode(&appointment)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Appointment not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding appointment: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check authorization
		if userRole == "patient" && appointment.PatientID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else if userRole == "doctor" && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Update appointment status
		update := bson.M{
			"$set": bson.M{
				"status":    "cancelled",
				"notes":     appointment.Notes + "\nCancellation reason: " + cancelReq.Reason,
				"updatedAt": time.Now(),
			},
		}

		_, err = appointmentsCollection.UpdateOne(ctx, bson.M{"_id": appointmentID}, update)
		if err != nil {
			log.Printf("Error cancelling appointment: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send notification to the other party
		var recipientID primitive.ObjectID
		var recipientRole string
		
		if userRole == "doctor" {
			recipientID = appointment.PatientID
			recipientRole = "patient"
		} else {
			recipientID = appointment.DoctorID
			recipientRole = "doctor"
		}
		
		// Get recipient user
		usersCollection := config.GetCollection(client, "users_auth")
		var recipient models.User
		err = usersCollection.FindOne(ctx, bson.M{"_id": recipientID}).Decode(&recipient)
		if err == nil && recipient.Email != "" {
			// Send email notification
			subject := "Appointment Cancelled"
			htmlBody := "<p>Your appointment scheduled for " + 
				appointment.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + 
				" has been cancelled.</p>"
			if cancelReq.Reason != "" {
				htmlBody += "<p>Reason: " + cancelReq.Reason + "</p>"
			}
			htmlBody += "<p>Please log in to the platform for more details.</p>"
			
			textBody := "Your appointment scheduled for " + 
				appointment.ScheduledAt.Format("Mon, Jan 2, 2006 at 3:04 PM") + 
				" has been cancelled.\n"
			if cancelReq.Reason != "" {
				textBody += "Reason: " + cancelReq.Reason + "\n"
			}
			textBody += "Please log in to the platform for more details."
			
			err = awsConfig.SendEmail(recipient.Email, subject, htmlBody, textBody)
			if err != nil {
				log.Printf("Error sending email notification: %v", err)
				// Continue despite email sending failure
			}

			// Send SMS notification if phone available
			if recipient.Phone != "" {
				message := "Appointment on " + appointment.ScheduledAt.Format("Jan 2 at 3:04 PM") + 
					" has been cancelled. Log in for details."
				err = awsConfig.SendSMS(recipient.Phone, message)
				if err != nil {
					log.Printf("Error sending SMS notification: %v", err)
					// Continue despite SMS sending failure
				}
			}
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Appointment cancelled successfully"}`))
	}
}
