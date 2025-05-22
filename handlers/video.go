
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"practo-clone/config"
	"practo-clone/models"
)

// RegisterVideoRoutes registers all video related routes
func RegisterVideoRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	videoRouter := router.PathPrefix("/api/video").Subrouter()

	// Register the routes
	videoRouter.HandleFunc("/session", createVideoSessionHandler(client, awsConfig)).Methods("POST")
	videoRouter.HandleFunc("/session/{id}", getVideoSessionHandler(client)).Methods("GET")
	videoRouter.HandleFunc("/join/{id}", joinVideoSessionHandler(client)).Methods("GET")
	videoRouter.HandleFunc("/end/{id}", endVideoSessionHandler(client)).Methods("POST")
}

// createVideoSessionHandler creates a new video session
func createVideoSessionHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
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

		var sessionReq models.VideoSessionRequest
		err = json.NewDecoder(r.Body).Decode(&sessionReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if sessionReq.AppointmentID == "" {
			http.Error(w, "Appointment ID is required", http.StatusBadRequest)
			return
		}

		// Convert appointment ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(sessionReq.AppointmentID)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the appointment to verify user is part of it
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

		// Check if user is part of this appointment
		isDoctor := userRole == "doctor" && appointment.DoctorID == userID
		isPatient := userRole == "patient" && appointment.PatientID == userID
		if !isDoctor && !isPatient {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Check if the appointment is confirmed and in the future
		if appointment.Status != "confirmed" {
			http.Error(w, "Appointment must be confirmed", http.StatusBadRequest)
			return
		}

		// Get Twilio API credentials from Secrets Manager
		twilioAccountSid, err := awsConfig.GetSecret("TWILIO_ACCOUNT_SID")
		if err != nil {
			log.Printf("Error getting Twilio Account SID: %v", err)
			twilioAccountSid = os.Getenv("TWILIO_ACCOUNT_SID") // Fallback to env var
		}

		twilioApiKey, err := awsConfig.GetSecret("TWILIO_API_KEY")
		if err != nil {
			log.Printf("Error getting Twilio API Key: %v", err)
			twilioApiKey = os.Getenv("TWILIO_API_KEY") // Fallback to env var
		}

		twilioApiSecret, err := awsConfig.GetSecret("TWILIO_API_SECRET")
		if err != nil {
			log.Printf("Error getting Twilio API Secret: %v", err)
			twilioApiSecret = os.Getenv("TWILIO_API_SECRET") // Fallback to env var
		}

		// In a real implementation, you would use the Twilio SDK to create a room
		// For this example, we'll simulate the process with a mock room

		// Check if a session already exists for this appointment
		videoSessionsCollection := config.GetCollection(client, "video_sessions")
		var existingSession models.VideoSession
		err = videoSessionsCollection.FindOne(ctx, bson.M{
			"appointmentId": appointmentID,
			"status":        "scheduled",
		}).Decode(&existingSession)

		if err == nil {
			// Session already exists, return it
			// Return the session
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"sessionId":  existingSession.ID.Hex(),
				"sessionUrl": existingSession.SessionURL,
				"message":    "Video session already exists",
			})
			return
		} else if err != mongo.ErrNoDocuments {
			log.Printf("Error checking existing session: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create a mock room token (in a real implementation, this would be a Twilio room token)
		roomName := "appointment-" + appointmentID.Hex()
		sessionToken := "mock-token-" + primitive.NewObjectID().Hex()
		sessionURL := "https://video.example.com/join?room=" + roomName + "&token=" + sessionToken

		// Create a new video session
		now := time.Now()
		videoSession := models.VideoSession{
			ID:            primitive.NewObjectID(),
			AppointmentID: appointmentID,
			PatientID:     appointment.PatientID,
			DoctorID:      appointment.DoctorID,
			Status:        "scheduled",
			SessionToken:  sessionToken,
			SessionURL:    sessionURL,
			Provider:      "twilio", // Or "webrtc" depending on implementation
			StartTime:     now,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		// Insert session into database
		_, err = videoSessionsCollection.InsertOne(ctx, videoSession)
		if err != nil {
			log.Printf("Error creating video session: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get user profiles for the doctor and patient
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var doctorProfile, patientProfile models.UserProfile
		
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": appointment.DoctorID}).Decode(&doctorProfile)
		if err != nil {
			log.Printf("Error finding doctor profile: %v", err)
			// Continue without doctor name
		}

		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": appointment.PatientID}).Decode(&patientProfile)
		if err != nil {
			log.Printf("Error finding patient profile: %v", err)
			// Continue without patient name
		}

		// Create response
		response := models.VideoSessionResponse{
			ID:            videoSession.ID,
			AppointmentID: videoSession.AppointmentID,
			SessionToken:  videoSession.SessionToken,
			SessionURL:    videoSession.SessionURL,
			PatientName:   patientProfile.FullName,
			DoctorName:    doctorProfile.FullName,
			StartTime:     videoSession.StartTime,
		}

		// Return the session
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// getVideoSessionHandler returns a video session by ID
func getVideoSessionHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		sessionID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid session ID", http.StatusBadRequest)
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

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the session
		videoSessionsCollection := config.GetCollection(client, "video_sessions")
		var session models.VideoSession
		err = videoSessionsCollection.FindOne(ctx, bson.M{"_id": sessionID}).Decode(&session)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Session not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding session: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if user is part of this session
		if session.PatientID != userID && session.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Get user profiles for the doctor and patient
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var doctorProfile, patientProfile models.UserProfile
		
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": session.DoctorID}).Decode(&doctorProfile)
		if err != nil {
			log.Printf("Error finding doctor profile: %v", err)
			// Continue without doctor name
		}

		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": session.PatientID}).Decode(&patientProfile)
		if err != nil {
			log.Printf("Error finding patient profile: %v", err)
			// Continue without patient name
		}

		// Create response
		response := models.VideoSessionResponse{
			ID:            session.ID,
			AppointmentID: session.AppointmentID,
			SessionToken:  session.SessionToken,
			SessionURL:    session.SessionURL,
			PatientName:   patientProfile.FullName,
			DoctorName:    doctorProfile.FullName,
			StartTime:     session.StartTime,
		}

		// Return the session
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// joinVideoSessionHandler returns the information needed to join a video session
func joinVideoSessionHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		sessionID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid session ID", http.StatusBadRequest)
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

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the session
		videoSessionsCollection := config.GetCollection(client, "video_sessions")
		var session models.VideoSession
		err = videoSessionsCollection.FindOne(ctx, bson.M{"_id": sessionID}).Decode(&session)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Session not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding session: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if user is part of this session
		if session.PatientID != userID && session.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Check if session is active
		if session.Status != "scheduled" && session.Status != "ongoing" {
			http.Error(w, "Session is not active", http.StatusBadRequest)
			return
		}

		// If session is scheduled, mark it as ongoing
		if session.Status == "scheduled" {
			_, err = videoSessionsCollection.UpdateOne(
				ctx,
				bson.M{"_id": sessionID},
				bson.M{"$set": bson.M{"status": "ongoing", "updatedAt": time.Now()}},
			)
			if err != nil {
				log.Printf("Error updating session status: %v", err)
				// Continue despite error
			}
		}

		// Return the session URL
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"sessionUrl": session.SessionURL,
		})
	}
}

// endVideoSessionHandler ends a video session
func endVideoSessionHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		sessionID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid session ID", http.StatusBadRequest)
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

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the session
		videoSessionsCollection := config.GetCollection(client, "video_sessions")
		var session models.VideoSession
		err = videoSessionsCollection.FindOne(ctx, bson.M{"_id": session.ID}).Decode(&session)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Session not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding session: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if user is part of this session
		if session.PatientID != userID && session.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Update session status and end time
		now := time.Now()
		endTime := now
		duration := int(endTime.Sub(session.StartTime).Seconds())

		_, err = videoSessionsCollection.UpdateOne(
			ctx,
			bson.M{"_id": sessionID},
			bson.M{
				"$set": bson.M{
					"status":    "completed",
					"endTime":   endTime,
					"duration":  duration,
					"updatedAt": now,
				},
			},
		)
		if err != nil {
			log.Printf("Error ending session: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Session ended successfully"}`))
	}
}
