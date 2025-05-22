
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"practo-clone/config"
)

// RegisterRecommendationRoutes registers all recommendation related routes
func RegisterRecommendationRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	recRouter := router.PathPrefix("/api/recommendations").Subrouter()

	// Register the routes
	recRouter.HandleFunc("/symptoms", getSymptomListHandler(client)).Methods("GET")
	recRouter.HandleFunc("/doctors", recommendDoctorsHandler(client)).Methods("POST")
}

// getSymptomListHandler returns a list of all symptoms
func getSymptomListHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get all symptoms from the database
		symptomsCollection := config.GetCollection(client, "symptoms")
		opts := options.Find().SetSort(bson.D{{Key: "name", Value: 1}})
		cursor, err := symptomsCollection.Find(ctx, bson.M{}, opts)
		if err != nil {
			log.Printf("Error finding symptoms: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var symptoms []map[string]interface{}
		if err = cursor.All(ctx, &symptoms); err != nil {
			log.Printf("Error decoding symptoms: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// If no symptoms exist yet, return a default list
		if len(symptoms) == 0 {
			// Sample symptom data - in a real implementation, this would be in the database
			defaultSymptoms := []map[string]string{
				{"id": "1", "name": "Headache", "specialties": "Neurology,General Practice"},
				{"id": "2", "name": "Chest Pain", "specialties": "Cardiology,Emergency Medicine"},
				{"id": "3", "name": "Shortness of Breath", "specialties": "Pulmonology,Cardiology"},
				{"id": "4", "name": "Abdominal Pain", "specialties": "Gastroenterology,General Surgery"},
				{"id": "5", "name": "Joint Pain", "specialties": "Rheumatology,Orthopedics"},
				{"id": "6", "name": "Skin Rash", "specialties": "Dermatology,Allergy and Immunology"},
				{"id": "7", "name": "Fever", "specialties": "Infectious Disease,General Practice"},
				{"id": "8", "name": "Dizziness", "specialties": "Neurology,ENT"},
				{"id": "9", "name": "Vision Problems", "specialties": "Ophthalmology,Neurology"},
				{"id": "10", "name": "Back Pain", "specialties": "Orthopedics,Neurosurgery,Pain Management"},
			}
			
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"symptoms": defaultSymptoms,
			})
			return
		}

		// Return the symptoms
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"symptoms": symptoms,
		})
	}
}

// recommendDoctorsHandler recommends doctors based on symptoms
func recommendDoctorsHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var recommendationReq struct {
			Symptoms    []string `json:"symptoms"`
			Languages   []string `json:"languages"`
			Gender      string   `json:"gender"`
			MaxDistance int      `json:"maxDistance"`
		}

		err := json.NewDecoder(r.Body).Decode(&recommendationReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if len(recommendationReq.Symptoms) == 0 {
			http.Error(w, "At least one symptom is required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get the specialties associated with the symptoms
		symptomsCollection := config.GetCollection(client, "symptoms")
		filter := bson.M{"name": bson.M{"$in": recommendationReq.Symptoms}}
		cursor, err := symptomsCollection.Find(ctx, filter)
		if err != nil {
			log.Printf("Error finding symptoms: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var specialtiesSet = make(map[string]bool)
		var symptoms []struct {
			Name        string   `bson:"name"`
			Specialties []string `bson:"specialties"`
		}

		if err = cursor.All(ctx, &symptoms); err != nil {
			log.Printf("Error decoding symptoms: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// If no symptoms match in the database, use a default mapping
		if len(symptoms) == 0 {
			// Default symptom to specialty mapping
			symptomMap := map[string][]string{
				"Headache":            {"Neurology", "General Practice"},
				"Chest Pain":          {"Cardiology", "Emergency Medicine"},
				"Shortness of Breath": {"Pulmonology", "Cardiology"},
				"Abdominal Pain":      {"Gastroenterology", "General Surgery"},
				"Joint Pain":          {"Rheumatology", "Orthopedics"},
				"Skin Rash":           {"Dermatology", "Allergy and Immunology"},
				"Fever":               {"Infectious Disease", "General Practice"},
				"Dizziness":           {"Neurology", "ENT"},
				"Vision Problems":      {"Ophthalmology", "Neurology"},
				"Back Pain":           {"Orthopedics", "Neurosurgery", "Pain Management"},
			}
			
			for _, symptom := range recommendationReq.Symptoms {
				if specialties, ok := symptomMap[symptom]; ok {
					for _, specialty := range specialties {
						specialtiesSet[specialty] = true
					}
				}
			}
		} else {
			// Collect all unique specialties from the symptoms
			for _, symptom := range symptoms {
				for _, specialty := range symptom.Specialties {
					specialtiesSet[specialty] = true
				}
			}
		}

		// Convert the set to a slice
		var specialties []string
		for specialty := range specialtiesSet {
			specialties = append(specialties, specialty)
		}

		// If no specialties were found, return an empty result
		if len(specialties) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"doctors": []interface{}{},
				"specialties": []string{},
			})
			return
		}

		// Create a filter for doctors
		doctorFilter := bson.M{
			"specialties": bson.M{"$in": specialties},
			"isVerified":  true,
		}

		// Add language filter if provided
		if len(recommendationReq.Languages) > 0 {
			doctorFilter["languages"] = bson.M{"$in": recommendationReq.Languages}
		}

		// Get doctor profiles matching the specialties
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		opts := options.Find().
			SetSort(bson.D{{Key: "consultationFee", Value: 1}}).
			SetLimit(10) // Limit to 10 recommended doctors

		doctorCursor, err := doctorProfilesCollection.Find(ctx, doctorFilter, opts)
		if err != nil {
			log.Printf("Error finding doctors: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer doctorCursor.Close(ctx)

		var doctorProfiles []map[string]interface{}
		if err = doctorCursor.All(ctx, &doctorProfiles); err != nil {
			log.Printf("Error decoding doctor profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get the user IDs of the doctors
		var doctorUserIDs []interface{}
		for _, profile := range doctorProfiles {
			doctorUserIDs = append(doctorUserIDs, profile["userId"])
		}

		// Get the user profiles for these doctors
		userProfilesCollection := config.GetCollection(client, "users_profile")
		userFilter := bson.M{"userId": bson.M{"$in": doctorUserIDs}}
		userCursor, err := userProfilesCollection.Find(ctx, userFilter)
		if err != nil {
			log.Printf("Error finding user profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer userCursor.Close(ctx)

		var userProfiles []map[string]interface{}
		if err = userCursor.All(ctx, &userProfiles); err != nil {
			log.Printf("Error decoding user profiles: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create a map of user IDs to user profiles
		userProfileMap := make(map[string]map[string]interface{})
		for _, profile := range userProfiles {
			userID, ok := profile["userId"].(string)
			if ok {
				userProfileMap[userID] = profile
			}
		}

		// Combine doctor and user profiles
		var recommendedDoctors []map[string]interface{}
		for _, doctorProfile := range doctorProfiles {
			doctorID, ok := doctorProfile["_id"].(string)
			if !ok {
				continue
			}

			userID, ok := doctorProfile["userId"].(string)
			if !ok {
				continue
			}

			userProfile, ok := userProfileMap[userID]
			if !ok {
				continue
			}

			// Check if the doctor's specialties match the needed specialties
			doctorSpecialties, ok := doctorProfile["specialties"].([]interface{})
			if !ok {
				continue
			}

			// Count how many of the needed specialties this doctor has
			matchCount := 0
			for _, docSpecialty := range doctorSpecialties {
				docSpec, ok := docSpecialty.(string)
				if !ok {
					continue
				}

				for _, neededSpecialty := range specialties {
					if docSpec == neededSpecialty {
						matchCount++
						break
					}
				}
			}

			// Create a combined profile
			recommendedDoctor := map[string]interface{}{
				"id":              doctorID,
				"userId":          userID,
				"fullName":        userProfile["fullName"],
				"specialties":     doctorProfile["specialties"],
				"languages":       userProfile["languages"],
				"profileImage":    userProfile["profileImage"],
				"bio":             doctorProfile["bio"],
				"experience":      doctorProfile["experience"],
				"consultationFee": doctorProfile["consultationFee"],
				"matchScore":      float64(matchCount) / float64(len(specialties)), // Calculate a match score
			}

			recommendedDoctors = append(recommendedDoctors, recommendedDoctor)
		}

		// Sort the recommended doctors by match score (in a real implementation)
		// For this example, we'll assume they're already sorted

		// Return the recommended doctors
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"doctors":     recommendedDoctors,
			"specialties": specialties,
		})
	}
}
