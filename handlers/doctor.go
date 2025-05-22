
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"practo-clone/config"
	"practo-clone/models"
)

// RegisterDoctorRoutes registers all doctor related routes
func RegisterDoctorRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	doctorRouter := router.PathPrefix("/api/doctors").Subrouter()

	// Register the routes
	doctorRouter.HandleFunc("", getDoctorsHandler(client)).Methods("GET")
	doctorRouter.HandleFunc("/{id}", getDoctorByIDHandler(client)).Methods("GET")
	doctorRouter.HandleFunc("/specialties", getSpecialtiesHandler(client)).Methods("GET")
	doctorRouter.HandleFunc("/availability", getDoctorAvailabilityHandler(client)).Methods("GET")
	doctorRouter.HandleFunc("/verify-license", verifyDoctorLicenseHandler(client)).Methods("POST")
}

// getDoctorsHandler returns a list of doctors based on filters
func getDoctorsHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse query parameters for filtering
		query := r.URL.Query()
		var filter bson.M = bson.M{}

		// Add filters if they exist
		if specialty := query.Get("specialty"); specialty != "" {
			filter["specialties"] = specialty
		}

		if language := query.Get("language"); language != "" {
			filter["languages"] = language
		}

		// Only show verified doctors
		filter["isVerified"] = true

		// Parse pagination parameters
		limit := 10
		page := 1
		if limitStr := query.Get("limit"); limitStr != "" {
			if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
				limit = l
			}
		}

		if pageStr := query.Get("page"); pageStr != "" {
			if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
				page = p
			}
		}

		skip := (page - 1) * limit

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get doctor profiles
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		opts := options.Find().
			SetLimit(int64(limit)).
			SetSkip(int64(skip)).
			SetSort(bson.D{{Key: "consultationFee", Value: 1}})

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

		// Create a map of userIDs to user profiles
		userProfileMap := make(map[primitive.ObjectID]models.UserProfile)
		for _, profile := range userProfiles {
			userProfileMap[profile.UserID] = profile
		}

		// Combine doctor and user profiles
		type DoctorResponse struct {
			ID              primitive.ObjectID `json:"id"`
			UserID          primitive.ObjectID `json:"userId"`
			FullName        string             `json:"fullName"`
			Specialties     []string           `json:"specialties"`
			Languages       []string           `json:"languages"`
			ProfileImage    string             `json:"profileImage"`
			Bio             string             `json:"bio"`
			Experience      int                `json:"experience"`
			ConsultationFee float64            `json:"consultationFee"`
		}

		var response []DoctorResponse
		for _, doctorProfile := range doctorProfiles {
			userProfile, ok := userProfileMap[doctorProfile.UserID]
			if !ok {
				continue
			}

			response = append(response, DoctorResponse{
				ID:              doctorProfile.ID,
				UserID:          doctorProfile.UserID,
				FullName:        userProfile.FullName,
				Specialties:     doctorProfile.Specialties,
				Languages:       userProfile.Languages,
				ProfileImage:    userProfile.ProfileImage,
				Bio:             doctorProfile.Bio,
				Experience:      doctorProfile.Experience,
				ConsultationFee: doctorProfile.ConsultationFee,
			})
		}

		// Get total count for pagination
		count, err := doctorProfilesCollection.CountDocuments(ctx, filter)
		if err != nil {
			log.Printf("Error counting doctors: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return the doctors
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"doctors": response,
			"meta": map[string]interface{}{
				"total":  count,
				"limit":  limit,
				"page":   page,
				"pages":  (count + int64(limit) - 1) / int64(limit),
			},
		})
	}
}

// getDoctorByIDHandler returns a doctor by ID
func getDoctorByIDHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		// Get doctor profile
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

		// Get user profile
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var userProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": doctorProfile.UserID}).Decode(&userProfile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "User profile not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding user profile: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Combine the data
		type DoctorDetailResponse struct {
			ID              primitive.ObjectID        `json:"id"`
			UserID          primitive.ObjectID        `json:"userId"`
			FullName        string                    `json:"fullName"`
			Specialties     []string                  `json:"specialties"`
			Languages       []string                  `json:"languages"`
			ProfileImage    string                    `json:"profileImage"`
			Bio             string                    `json:"bio"`
			Experience      int                       `json:"experience"`
			Education       []models.Education        `json:"education"`
			ConsultationFee float64                   `json:"consultationFee"`
			Availability    []models.Availability     `json:"availability"`
		}

		response := DoctorDetailResponse{
			ID:              doctorProfile.ID,
			UserID:          doctorProfile.UserID,
			FullName:        userProfile.FullName,
			Specialties:     doctorProfile.Specialties,
			Languages:       userProfile.Languages,
			ProfileImage:    userProfile.ProfileImage,
			Bio:             doctorProfile.Bio,
			Experience:      doctorProfile.Experience,
			Education:       doctorProfile.Education,
			ConsultationFee: doctorProfile.ConsultationFee,
			Availability:    doctorProfile.Availability,
		}

		// Return the doctor
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// getSpecialtiesHandler returns a list of all specialties
func getSpecialtiesHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get all specialties
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		pipeline := bson.A{
			bson.M{"$unwind": "$specialties"},
			bson.M{"$group": bson.M{"_id": "$specialties"}},
			bson.M{"$sort": bson.M{"_id": 1}},
		}

		cursor, err := doctorProfilesCollection.Aggregate(ctx, pipeline)
		if err != nil {
			log.Printf("Error aggregating specialties: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var specialties []struct {
			ID string `bson:"_id" json:"specialty"`
		}
		if err = cursor.All(ctx, &specialties); err != nil {
			log.Printf("Error decoding specialties: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Extract specialty names
		var specialtyNames []string
		for _, specialty := range specialties {
			specialtyNames = append(specialtyNames, specialty.ID)
		}

		// Return the specialties
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{
			"specialties": specialtyNames,
		})
	}
}

// getDoctorAvailabilityHandler returns a doctor's availability
func getDoctorAvailabilityHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse query parameters
		doctorIDStr := r.URL.Query().Get("doctorId")
		dateStr := r.URL.Query().Get("date")

		// Validate parameters
		if doctorIDStr == "" {
			http.Error(w, "Doctor ID is required", http.StatusBadRequest)
			return
		}

		doctorID, err := primitive.ObjectIDFromHex(doctorIDStr)
		if err != nil {
			http.Error(w, "Invalid doctor ID", http.StatusBadRequest)
			return
		}

		// Parse date
		var date time.Time
		if dateStr != "" {
			date, err = time.Parse("2006-01-02", dateStr)
			if err != nil {
				http.Error(w, "Invalid date format (use YYYY-MM-DD)", http.StatusBadRequest)
				return
			}
		} else {
			date = time.Now()
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get doctor's availability
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

		// Get day of week
		dayOfWeek := date.Weekday().String()

		// Filter availability for the given day
		var dayAvailability []models.Availability
		for _, avail := range doctorProfile.Availability {
			if avail.DayOfWeek == dayOfWeek {
				dayAvailability = append(dayAvailability, avail)
			}
		}

		// Check existing appointments
		appointmentsCollection := config.GetCollection(client, "appointments")
		startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
		endOfDay := startOfDay.Add(24 * time.Hour)

		appointmentFilter := bson.M{
			"doctorId":    doctorID,
			"scheduledAt": bson.M{"$gte": startOfDay, "$lt": endOfDay},
			"status":      bson.M{"$nin": []string{"cancelled"}},
		}

		cursor, err := appointmentsCollection.Find(ctx, appointmentFilter)
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

		// Convert scheduled appointments to time slots
		bookedSlots := make(map[string]bool)
		for _, appointment := range appointments {
			slot := appointment.ScheduledAt.Format("15:04")
			bookedSlots[slot] = true
		}

		// Generate available time slots
		type TimeSlot struct {
			Time     string `json:"time"`
			IsBooked bool   `json:"isBooked"`
		}

		var availableSlots []TimeSlot
		for _, avail := range dayAvailability {
			start, _ := time.Parse("15:04", avail.StartTime)
			end, _ := time.Parse("15:04", avail.EndTime)

			// Generate slots every 30 minutes
			for t := start; t.Before(end); t = t.Add(30 * time.Minute) {
				slot := t.Format("15:04")
				availableSlots = append(availableSlots, TimeSlot{
					Time:     slot,
					IsBooked: bookedSlots[slot],
				})
			}
		}

		// Return the availability
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"date":           date.Format("2006-01-02"),
			"dayOfWeek":      dayOfWeek,
			"availableSlots": availableSlots,
		})
	}
}

// verifyDoctorLicenseHandler verifies a doctor's license
func verifyDoctorLicenseHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Only allow authorized doctor users
		userIDStr, ok := r.Context().Value("userId").(string)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "doctor" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := primitive.ObjectIDFromHex(userIDStr)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		var verifyReq struct {
			LicenseNumber string `json:"licenseNumber"`
			BIGNumber     string `json:"bigNumber"`
		}

		err = json.NewDecoder(r.Body).Decode(&verifyReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if verifyReq.LicenseNumber == "" || verifyReq.BIGNumber == "" {
			http.Error(w, "License number and BIG number are required", http.StatusBadRequest)
			return
		}

		// Get doctor profile
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{"userId": userID}).Decode(&doctorProfile)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Doctor profile not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding doctor profile: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// In a real implementation, you would verify the license number against the BIG register
		// For this example, we'll simulate a successful verification
		isVerified := true

		// Update doctor profile
		update := bson.M{
			"$set": bson.M{
				"licenseNumber":     verifyReq.LicenseNumber,
				"bigNumber":         verifyReq.BIGNumber,
				"isVerified":        isVerified,
				"verificationStatus": "pending", // Admin will confirm later
				"updatedAt":         time.Now(),
			},
		}

		_, err = doctorProfilesCollection.UpdateOne(ctx, bson.M{"userId": userID}, update)
		if err != nil {
			log.Printf("Error updating doctor profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "License verification request submitted"}`))
	}
}
