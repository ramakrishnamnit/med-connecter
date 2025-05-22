
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

	"practo-clone/config"
	"practo-clone/models"
)

// RegisterUserRoutes registers all user related routes
func RegisterUserRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	userRouter := router.PathPrefix("/api/users").Subrouter()

	// Register the routes
	userRouter.HandleFunc("/me", getUserProfileHandler(client)).Methods("GET")
	userRouter.HandleFunc("/me", updateUserProfileHandler(client, awsConfig)).Methods("PUT")
	userRouter.HandleFunc("/profile/upload", uploadProfileImageHandler(client, awsConfig)).Methods("POST")
}

// getUserProfileHandler retrieves the current user's profile
func getUserProfileHandler(client *mongo.Client) http.HandlerFunc {
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

		// Get user role
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get user profile
		profilesCollection := config.GetCollection(client, "users_profile")
		var profile models.UserProfile
		err = profilesCollection.FindOne(ctx, bson.M{"userId": userID}).Decode(&profile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Profile not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding profile: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// If user is a doctor, get doctor profile
		var doctorProfile *models.DoctorProfile
		if userRole == "doctor" {
			doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
			var dp models.DoctorProfile
			err = doctorProfilesCollection.FindOne(ctx, bson.M{"userId": userID}).Decode(&dp)
			if err == nil {
				doctorProfile = &dp
			} else if err != mongo.ErrNoDocuments {
				log.Printf("Error finding doctor profile: %v", err)
				// Continue without doctor profile
			}
		}

		// Combine the data
		response := map[string]interface{}{
			"profile": profile,
		}

		if doctorProfile != nil {
			response["doctorProfile"] = doctorProfile
		}

		// Return the profile
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// updateUserProfileHandler updates the current user's profile
func updateUserProfileHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
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

		// Get user role
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var updateReq map[string]interface{}
		err = json.NewDecoder(r.Body).Decode(&updateReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Update user profile
		profileUpdate := bson.M{
			"$set": bson.M{
				"updatedAt": time.Now(),
			},
		}

		// Add fields to update if they exist
		profileFields := []string{"fullName", "dob", "gender", "address", "city", "country", "postalCode", "languages"}
		for _, field := range profileFields {
			if val, ok := updateReq[field]; ok {
				profileUpdate["$set"].(bson.M)[field] = val
			}
		}

		profilesCollection := config.GetCollection(client, "users_profile")
		_, err = profilesCollection.UpdateOne(ctx, bson.M{"userId": userID}, profileUpdate)
		if err != nil {
			log.Printf("Error updating profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Update doctor profile if user is a doctor
		if userRole == "doctor" {
			// Check if doctor profile data was provided
			doctorProfileData, ok := updateReq["doctorProfile"].(map[string]interface{})
			if ok {
				doctorUpdate := bson.M{
					"$set": bson.M{
						"updatedAt": time.Now(),
					},
				}

				// Add fields to update if they exist
				doctorFields := []string{"specialties", "bio", "experience", "education", "consultationFee", "availability"}
				for _, field := range doctorFields {
					if val, ok := doctorProfileData[field]; ok {
						doctorUpdate["$set"].(bson.M)[field] = val
					}
				}

				doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
				_, err = doctorProfilesCollection.UpdateOne(ctx, bson.M{"userId": userID}, doctorUpdate)
				if err != nil {
					log.Printf("Error updating doctor profile: %v", err)
					http.Error(w, "Internal server error", http.StatusInternalServerError)
					return
				}
			}
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Profile updated successfully"}`))
	}
}

// uploadProfileImageHandler handles uploading profile images
func uploadProfileImageHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
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

		// Parse the multipart form
		err = r.ParseMultipartForm(10 << 20) // 10 MB max
		if err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		// Get the file
		file, header, err := r.FormFile("image")
		if err != nil {
			http.Error(w, "Failed to get file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Check file size and type
		if header.Size > 10<<20 { // 10 MB
			http.Error(w, "File too large", http.StatusBadRequest)
			return
		}

		// Read file content
		buffer := make([]byte, header.Size)
		_, err = file.Read(buffer)
		if err != nil {
			http.Error(w, "Failed to read file", http.StatusBadRequest)
			return
		}

		// Upload to S3
		objectKey := "profiles/" + userID.Hex() + "/" + header.Filename
		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "image/jpeg" // Default
		}

		imageURL, err := awsConfig.UploadToS3("practo-clone-user-images", objectKey, buffer, contentType)
		if err != nil {
			log.Printf("Error uploading to S3: %v", err)
			http.Error(w, "Failed to upload image", http.StatusInternalServerError)
			return
		}

		// Update user profile with the image URL
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		profilesCollection := config.GetCollection(client, "users_profile")
		update := bson.M{
			"$set": bson.M{
				"profileImage": imageURL,
				"updatedAt":    time.Now(),
			},
		}

		_, err = profilesCollection.UpdateOne(ctx, bson.M{"userId": userID}, update)
		if err != nil {
			log.Printf("Error updating profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return the image URL
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"imageUrl": imageURL,
		})
	}
}
