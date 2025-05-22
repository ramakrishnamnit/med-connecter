
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
	"golang.org/x/crypto/bcrypt"

	"practo-clone/config"
	"practo-clone/middleware"
	"practo-clone/models"
)

// RegisterAuthRoutes registers all auth related routes
func RegisterAuthRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	authRouter := router.PathPrefix("/api/auth").Subrouter()

	// Register the routes
	authRouter.HandleFunc("/register", registerHandler(client, awsConfig)).Methods("POST")
	authRouter.HandleFunc("/login", loginHandler(client)).Methods("POST")
	authRouter.HandleFunc("/verify-email/{token}", verifyEmailHandler(client)).Methods("GET")
	authRouter.HandleFunc("/reset-password", resetPasswordHandler(client, awsConfig)).Methods("POST")
}

// registerHandler handles user registration
func registerHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var registerReq models.RegisterRequest
		err := json.NewDecoder(r.Body).Decode(&registerReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if registerReq.Email == "" || registerReq.Password == "" || registerReq.Role == "" {
			http.Error(w, "Email, password, and role are required", http.StatusBadRequest)
			return
		}

		// Check if user already exists
		usersCollection := config.GetCollection(client, "users_auth")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var existingUser models.User
		err = usersCollection.FindOne(ctx, bson.M{"email": registerReq.Email}).Decode(&existingUser)
		if err == nil {
			http.Error(w, "User already exists", http.StatusConflict)
			return
		} else if err != mongo.ErrNoDocuments {
			log.Printf("Error checking existing user: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Hash the password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(registerReq.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Error hashing password: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create new user
		now := time.Now()
		newUser := models.User{
			ID:              primitive.NewObjectID(),
			Email:           registerReq.Email,
			PasswordHash:    string(hashedPassword),
			Phone:           registerReq.Phone,
			IsEmailVerified: false,
			IsMobileVerified: false,
			Role:            registerReq.Role,
			CreatedAt:       now,
			UpdatedAt:       now,
		}

		// Insert user into database
		_, err = usersCollection.InsertOne(ctx, newUser)
		if err != nil {
			log.Printf("Error creating user: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Create user profile
		userProfilesCollection := config.GetCollection(client, "users_profile")
		newProfile := models.UserProfile{
			ID:         primitive.NewObjectID(),
			UserID:     newUser.ID,
			FullName:   registerReq.FullName,
			CreatedAt:  now,
			UpdatedAt:  now,
		}

		// Insert profile into database
		_, err = userProfilesCollection.InsertOne(ctx, newProfile)
		if err != nil {
			log.Printf("Error creating user profile: %v", err)
			// Consider deleting the user if profile creation fails
		}

		// Create doctor profile if role is doctor
		if registerReq.Role == "doctor" {
			doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
			newDoctorProfile := models.DoctorProfile{
				ID:                 primitive.NewObjectID(),
				UserID:             newUser.ID,
				IsVerified:         false,
				VerificationStatus: "pending",
				ConsultationFee:    50.0, // Default consultation fee
				CreatedAt:          now,
				UpdatedAt:          now,
			}

			// Insert doctor profile into database
			_, err = doctorProfilesCollection.InsertOne(ctx, newDoctorProfile)
			if err != nil {
				log.Printf("Error creating doctor profile: %v", err)
				// Consider deleting the user if doctor profile creation fails
			}
		}

		// Generate JWT token
		token, err := middleware.GenerateJWT(newUser.ID.Hex(), newUser.Role)
		if err != nil {
			log.Printf("Error generating token: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send verification email
		verificationLink := "https://your-app.com/verify-email/" + newUser.ID.Hex()
		emailBody := "Please verify your email by clicking this link: " + verificationLink
		err = awsConfig.SendEmail(newUser.Email, "Verify Your Email", emailBody, emailBody)
		if err != nil {
			log.Printf("Error sending verification email: %v", err)
			// Continue despite email sending failure
		}

		// Return JWT token
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.AuthResponse{
			Token:        token,
			RefreshToken: "",
			UserID:       newUser.ID.Hex(),
			Role:         newUser.Role,
		})
	}
}

// loginHandler handles user login
func loginHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var loginReq models.LoginRequest
		err := json.NewDecoder(r.Body).Decode(&loginReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if loginReq.Email == "" || loginReq.Password == "" {
			http.Error(w, "Email and password are required", http.StatusBadRequest)
			return
		}

		// Find user by email
		usersCollection := config.GetCollection(client, "users_auth")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var user models.User
		err = usersCollection.FindOne(ctx, bson.M{"email": loginReq.Email}).Decode(&user)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Invalid email or password", http.StatusUnauthorized)
			} else {
				log.Printf("Error finding user: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Verify password
		err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(loginReq.Password))
		if err != nil {
			http.Error(w, "Invalid email or password", http.StatusUnauthorized)
			return
		}

		// Generate JWT token
		token, err := middleware.GenerateJWT(user.ID.Hex(), user.Role)
		if err != nil {
			log.Printf("Error generating token: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return JWT token
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.AuthResponse{
			Token:        token,
			RefreshToken: "",
			UserID:       user.ID.Hex(),
			Role:         user.Role,
		})
	}
}

// verifyEmailHandler handles email verification
func verifyEmailHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		token := vars["token"]

		// Convert token to ObjectID
		userID, err := primitive.ObjectIDFromHex(token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusBadRequest)
			return
		}

		// Update user's email verification status
		usersCollection := config.GetCollection(client, "users_auth")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		update := bson.M{"$set": bson.M{"isEmailVerified": true, "updatedAt": time.Now()}}
		result, err := usersCollection.UpdateOne(ctx, bson.M{"_id": userID}, update)
		if err != nil {
			log.Printf("Error updating user: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if result.MatchedCount == 0 {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// Redirect to login page
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Email verified successfully"}`))
	}
}

// resetPasswordHandler handles password reset requests
func resetPasswordHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var resetReq struct {
			Email string `json:"email"`
		}

		err := json.NewDecoder(r.Body).Decode(&resetReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Check if user exists
		usersCollection := config.GetCollection(client, "users_auth")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var user models.User
		err = usersCollection.FindOne(ctx, bson.M{"email": resetReq.Email}).Decode(&user)
		if err != nil {
			// Always return success even if user doesn't exist for security reasons
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"message": "If your email is registered, you will receive a password reset link."}`))
			return
		}

		// Generate a reset token
		resetToken := primitive.NewObjectID().Hex()

		// Store the reset token in the database
		update := bson.M{"$set": bson.M{"resetToken": resetToken, "resetTokenExp": time.Now().Add(24 * time.Hour)}}
		_, err = usersCollection.UpdateOne(ctx, bson.M{"_id": user.ID}, update)
		if err != nil {
			log.Printf("Error updating user: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Send password reset email
		resetLink := "https://your-app.com/reset-password/" + resetToken
		emailBody := "Please reset your password by clicking this link: " + resetLink
		err = awsConfig.SendEmail(user.Email, "Reset Your Password", emailBody, emailBody)
		if err != nil {
			log.Printf("Error sending reset email: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "If your email is registered, you will receive a password reset link."}`))
	}
}
