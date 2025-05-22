
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

// RegisterAdminRoutes registers all admin related routes
func RegisterAdminRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	adminRouter := router.PathPrefix("/api/admin").Subrouter()

	// Register the routes
	adminRouter.HandleFunc("/doctors", getUnapprovedDoctorsHandler(client)).Methods("GET")
	adminRouter.HandleFunc("/doctors/{id}/approve", approveDoctorHandler(client, awsConfig)).Methods("POST")
	adminRouter.HandleFunc("/doctors/{id}/reject", rejectDoctorHandler(client, awsConfig)).Methods("POST")
	adminRouter.HandleFunc("/stats", getAdminStatsHandler(client)).Methods("GET")
}

// getUnapprovedDoctorsHandler returns a list of doctors pending verification
func getUnapprovedDoctorsHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allow admin users
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get doctors pending verification
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		filter := bson.M{"verificationStatus": "pending"}
		opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}})

		cursor, err := doctorProfilesCollection.Find(ctx, filter, opts)
		if err != nil {
			log.Printf("Error finding doctors: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var doctorProfiles []models.DoctorProfile
		if err = cursor.All(ctx, &doctorProfiles); err != nil {
			log.Printf("Error decoding doctors: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get user IDs for doctors
		var userIDs []primitive.ObjectID
		for _, profile := range doctorProfiles {
			userIDs = append(userIDs, profile.UserID)
		}

		// Get user profiles for these doctors
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

		// Get user auth data for these doctors
		usersCollection := config.GetCollection(client, "users_auth")
		authFilter := bson.M{"_id": bson.M{"$in": userIDs}}
		authCursor, err := usersCollection.Find(ctx, authFilter)
		if err != nil {
			log.Printf("Error finding users: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer authCursor.Close(ctx)

		var users []models.User
		if err = authCursor.All(ctx, &users); err != nil {
			log.Printf("Error decoding users: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create a map of user IDs to users
		userMap := make(map[primitive.ObjectID]models.User)
		for _, user := range users {
			userMap[user.ID] = user
		}

		// Combine doctor, user profile, and user auth data
		type DoctorApprovalResponse struct {
			ID              primitive.ObjectID `json:"id"`
			UserID          primitive.ObjectID `json:"userId"`
			FullName        string             `json:"fullName"`
			Email           string             `json:"email"`
			Phone           string             `json:"phone"`
			Specialties     []string           `json:"specialties"`
			LicenseNumber   string             `json:"licenseNumber"`
			BIGNumber       string             `json:"bigNumber"`
			VerificationStatus string          `json:"verificationStatus"`
			CreatedAt       time.Time          `json:"createdAt"`
		}

		var response []DoctorApprovalResponse
		for _, doctorProfile := range doctorProfiles {
			userProfile, userProfileOk := userProfileMap[doctorProfile.UserID]
			user, userOk := userMap[doctorProfile.UserID]

			if !userProfileOk || !userOk {
				continue
			}

			response = append(response, DoctorApprovalResponse{
				ID:              doctorProfile.ID,
				UserID:          doctorProfile.UserID,
				FullName:        userProfile.FullName,
				Email:           user.Email,
				Phone:           user.Phone,
				Specialties:     doctorProfile.Specialties,
				LicenseNumber:   doctorProfile.LicenseNumber,
				BIGNumber:       doctorProfile.BIGNumber,
				VerificationStatus: doctorProfile.VerificationStatus,
				CreatedAt:       doctorProfile.CreatedAt,
			})
		}

		// Return the doctors
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"doctors": response,
		})
	}
}

// approveDoctorHandler approves a doctor
func approveDoctorHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allow admin users
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		doctorID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid doctor ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the doctor profile
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{"_id": doctorID}).Decode(&doctorProfile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Doctor not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding doctor: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if the doctor is pending verification
		if doctorProfile.VerificationStatus != "pending" {
			http.Error(w, "Doctor is not pending verification", http.StatusBadRequest)
			return
		}

		// Update doctor profile
		_, err = doctorProfilesCollection.UpdateOne(
			ctx,
			bson.M{"_id": doctorID},
			bson.M{
				"$set": bson.M{
					"isVerified":         true,
					"verificationStatus": "verified",
					"updatedAt":          time.Now(),
				},
			},
		)
		if err != nil {
			log.Printf("Error updating doctor profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send notification to the doctor
		usersCollection := config.GetCollection(client, "users_auth")
		var doctorUser models.User
		err = usersCollection.FindOne(ctx, bson.M{"_id": doctorProfile.UserID}).Decode(&doctorUser)
		if err == nil && doctorUser.Email != "" {
			// Send email notification
			subject := "Your Doctor Profile Has Been Approved"
			htmlBody := "<p>Congratulations! Your doctor profile has been approved.</p>" +
				"<p>You can now accept appointments and provide consultations through our platform.</p>"
			textBody := "Congratulations! Your doctor profile has been approved.\n" +
				"You can now accept appointments and provide consultations through our platform."
			
			err = awsConfig.SendEmail(doctorUser.Email, subject, htmlBody, textBody)
			if err != nil {
				log.Printf("Error sending email notification: %v", err)
				// Continue despite email sending failure
			}

			// Send SMS notification if phone available
			if doctorUser.Phone != "" {
				message := "Congratulations! Your doctor profile has been approved. You can now accept appointments."
				err = awsConfig.SendSMS(doctorUser.Phone, message)
				if err != nil {
					log.Printf("Error sending SMS notification: %v", err)
					// Continue despite SMS sending failure
				}
			}
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Doctor approved successfully"}`))
	}
}

// rejectDoctorHandler rejects a doctor
func rejectDoctorHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allow admin users
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		doctorID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid doctor ID", http.StatusBadRequest)
			return
		}

		// Parse request body to get rejection reason
		var rejectionReq struct {
			Reason string `json:"reason"`
		}
		err = json.NewDecoder(r.Body).Decode(&rejectionReq)
		if err != nil {
			// Continue without reason if body can't be parsed
			rejectionReq.Reason = "Your application did not meet our verification criteria."
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the doctor profile
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{"_id": doctorID}).Decode(&doctorProfile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Doctor not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding doctor: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if the doctor is pending verification
		if doctorProfile.VerificationStatus != "pending" {
			http.Error(w, "Doctor is not pending verification", http.StatusBadRequest)
			return
		}

		// Update doctor profile
		_, err = doctorProfilesCollection.UpdateOne(
			ctx,
			bson.M{"_id": doctorID},
			bson.M{
				"$set": bson.M{
					"isVerified":         false,
					"verificationStatus": "rejected",
					"rejectionReason":    rejectionReq.Reason,
					"updatedAt":          time.Now(),
				},
			},
		)
		if err != nil {
			log.Printf("Error updating doctor profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send notification to the doctor
		usersCollection := config.GetCollection(client, "users_auth")
		var doctorUser models.User
		err = usersCollection.FindOne(ctx, bson.M{"_id": doctorProfile.UserID}).Decode(&doctorUser)
		if err == nil && doctorUser.Email != "" {
			// Send email notification
			subject := "Doctor Profile Verification Status"
			htmlBody := "<p>Unfortunately, your doctor profile has not been approved.</p>"
			if rejectionReq.Reason != "" {
				htmlBody += "<p>Reason: " + rejectionReq.Reason + "</p>"
			}
			htmlBody += "<p>Please contact our support team for more information.</p>"
			
			textBody := "Unfortunately, your doctor profile has not been approved.\n"
			if rejectionReq.Reason != "" {
				textBody += "Reason: " + rejectionReq.Reason + "\n"
			}
			textBody += "Please contact our support team for more information."
			
			err = awsConfig.SendEmail(doctorUser.Email, subject, htmlBody, textBody)
			if err != nil {
				log.Printf("Error sending email notification: %v", err)
				// Continue despite email sending failure
			}
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Doctor rejected successfully"}`))
	}
}

// getAdminStatsHandler returns statistics for the admin dashboard
func getAdminStatsHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allow admin users
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get counts for various entities
		usersCollection := config.GetCollection(client, "users_auth")
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		appointmentsCollection := config.GetCollection(client, "appointments")
		paymentsCollection := config.GetCollection(client, "payments")

		// Count total users
		patientCount, err := usersCollection.CountDocuments(ctx, bson.M{"role": "patient"})
		if err != nil {
			log.Printf("Error counting patients: %v", err)
			patientCount = 0
		}

		doctorCount, err := usersCollection.CountDocuments(ctx, bson.M{"role": "doctor"})
		if err != nil {
			log.Printf("Error counting doctors: %v", err)
			doctorCount = 0
		}

		verifiedDoctorCount, err := doctorProfilesCollection.CountDocuments(ctx, bson.M{"isVerified": true})
		if err != nil {
			log.Printf("Error counting verified doctors: %v", err)
			verifiedDoctorCount = 0
		}

		pendingDoctorCount, err := doctorProfilesCollection.CountDocuments(ctx, bson.M{"verificationStatus": "pending"})
		if err != nil {
			log.Printf("Error counting pending doctors: %v", err)
			pendingDoctorCount = 0
		}

		// Count appointments
		totalAppointments, err := appointmentsCollection.CountDocuments(ctx, bson.M{})
		if err != nil {
			log.Printf("Error counting appointments: %v", err)
			totalAppointments = 0
		}

		completedAppointments, err := appointmentsCollection.CountDocuments(ctx, bson.M{"status": "completed"})
		if err != nil {
			log.Printf("Error counting completed appointments: %v", err)
			completedAppointments = 0
		}

		cancelledAppointments, err := appointmentsCollection.CountDocuments(ctx, bson.M{"status": "cancelled"})
		if err != nil {
			log.Printf("Error counting cancelled appointments: %v", err)
			cancelledAppointments = 0
		}

		// Count payments
		totalPayments, err := paymentsCollection.CountDocuments(ctx, bson.M{})
		if err != nil {
			log.Printf("Error counting payments: %v", err)
			totalPayments = 0
		}

		successfulPayments, err := paymentsCollection.CountDocuments(ctx, bson.M{"status": "successful"})
		if err != nil {
			log.Printf("Error counting successful payments: %v", err)
			successfulPayments = 0
		}

		// Get total revenue
		pipeline := bson.A{
			bson.M{"$match": bson.M{"status": "successful"}},
			bson.M{"$group": bson.M{"_id": nil, "total": bson.M{"$sum": "$amount"}}},
		}
		
		cursor, err := paymentsCollection.Aggregate(ctx, pipeline)
		if err != nil {
			log.Printf("Error aggregating payments: %v", err)
			// Continue without revenue
		}
		
		var result []bson.M
		if err = cursor.All(ctx, &result); err != nil {
			log.Printf("Error decoding revenue: %v", err)
			// Continue without revenue
		}
		
		var totalRevenue float64 = 0
		if len(result) > 0 {
			if total, ok := result[0]["total"].(float64); ok {
				totalRevenue = total
			}
		}

		// Get recent appointments
		appointmentOpts := options.Find().
			SetSort(bson.D{{Key: "createdAt", Value: -1}}).
			SetLimit(5)
		
		appointmentCursor, err := appointmentsCollection.Find(ctx, bson.M{}, appointmentOpts)
		if err != nil {
			log.Printf("Error finding recent appointments: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer appointmentCursor.Close(ctx)
		
		var recentAppointments []map[string]interface{}
		if err = appointmentCursor.All(ctx, &recentAppointments); err != nil {
			log.Printf("Error decoding recent appointments: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return the statistics
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"users": map[string]interface{}{
				"patients": patientCount,
				"doctors": map[string]interface{}{
					"total":     doctorCount,
					"verified":  verifiedDoctorCount,
					"pending":   pendingDoctorCount,
				},
			},
			"appointments": map[string]interface{}{
				"total":      totalAppointments,
				"completed":  completedAppointments,
				"cancelled":  cancelledAppointments,
				"recentList": recentAppointments,
			},
			"payments": map[string]interface{}{
				"total":      totalPayments,
				"successful": successfulPayments,
				"revenue":    totalRevenue,
			},
		})
	}
}
