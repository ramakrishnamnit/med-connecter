
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

// RegisterNotificationRoutes registers all notification related routes
func RegisterNotificationRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	notificationRouter := router.PathPrefix("/api/notifications").Subrouter()

	// Register the routes
	notificationRouter.HandleFunc("", getNotificationsHandler(client)).Methods("GET")
	notificationRouter.HandleFunc("/{id}/read", markNotificationReadHandler(client)).Methods("POST")
	notificationRouter.HandleFunc("/send", sendNotificationHandler(client, awsConfig)).Methods("POST")
}

// getNotificationsHandler returns notifications for the current user
func getNotificationsHandler(client *mongo.Client) http.HandlerFunc {
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

		// Parse query parameters
		query := r.URL.Query()
		limit := 20 // Default limit
		if limitStr := query.Get("limit"); limitStr != "" {
			if l, err := parseInt(limitStr); err == nil && l > 0 {
				limit = l
			}
		}

		skip := 0 // Default skip
		if skipStr := query.Get("skip"); skipStr != "" {
			if s, err := parseInt(skipStr); err == nil && s >= 0 {
				skip = s
			}
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get notifications for the user
		notificationsCollection := config.GetCollection(client, "notifications")
		filter := bson.M{"userId": userID}
		opts := options.Find().
			SetSort(bson.D{{Key: "createdAt", Value: -1}}).
			SetLimit(int64(limit)).
			SetSkip(int64(skip))

		cursor, err := notificationsCollection.Find(ctx, filter, opts)
		if err != nil {
			log.Printf("Error finding notifications: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer cursor.Close(ctx)

		var notifications []map[string]interface{}
		if err = cursor.All(ctx, &notifications); err != nil {
			log.Printf("Error decoding notifications: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Count total unread notifications
		countFilter := bson.M{"userId": userID, "read": false}
		unreadCount, err := notificationsCollection.CountDocuments(ctx, countFilter)
		if err != nil {
			log.Printf("Error counting unread notifications: %v", err)
			// Continue despite error
			unreadCount = 0
		}

		// Return the notifications
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"notifications": notifications,
			"unreadCount":   unreadCount,
		})
	}
}

// markNotificationReadHandler marks a notification as read
func markNotificationReadHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		notificationID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid notification ID", http.StatusBadRequest)
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

		// Update the notification
		notificationsCollection := config.GetCollection(client, "notifications")
		result, err := notificationsCollection.UpdateOne(
			ctx,
			bson.M{"_id": notificationID, "userId": userID},
			bson.M{"$set": bson.M{"read": true, "updatedAt": time.Now()}},
		)
		if err != nil {
			log.Printf("Error marking notification as read: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if result.MatchedCount == 0 {
			http.Error(w, "Notification not found or not authorized", http.StatusNotFound)
			return
		}

		// Return success
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Notification marked as read"}`))
	}
}

// sendNotificationHandler sends a notification to a user
func sendNotificationHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// This endpoint should only be accessible to admins or the system
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var notificationReq struct {
			UserID  string `json:"userId"`
			Type    string `json:"type"`    // email, sms, push, in-app
			Title   string `json:"title"`   // For in-app notifications
			Message string `json:"message"` // Content of the notification
			Link    string `json:"link"`    // Optional link for in-app notifications
		}

		err := json.NewDecoder(r.Body).Decode(&notificationReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if notificationReq.UserID == "" || notificationReq.Type == "" || notificationReq.Message == "" {
			http.Error(w, "User ID, type, and message are required", http.StatusBadRequest)
			return
		}

		// Convert user ID to ObjectID
		userID, err := primitive.ObjectIDFromHex(notificationReq.UserID)
		if err != nil {
			http.Error(w, "Invalid user ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get user details
		usersCollection := config.GetCollection(client, "users_auth")
		var user models.User
		err = usersCollection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "User not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding user: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Handle different notification types
		now := time.Now()
		notificationID := primitive.NewObjectID()
		sent := false

		switch notificationReq.Type {
		case "email":
			if user.Email != "" {
				err = awsConfig.SendEmail(
					user.Email,
					notificationReq.Title,
					notificationReq.Message,
					notificationReq.Message,
				)
				if err != nil {
					log.Printf("Error sending email: %v", err)
				} else {
					sent = true
				}
			}
		case "sms":
			if user.Phone != "" {
				err = awsConfig.SendSMS(user.Phone, notificationReq.Message)
				if err != nil {
					log.Printf("Error sending SMS: %v", err)
				} else {
					sent = true
				}
			}
		case "in-app":
			// Create in-app notification
			notificationsCollection := config.GetCollection(client, "notifications")
			_, err = notificationsCollection.InsertOne(ctx, bson.M{
				"_id":       notificationID,
				"userId":    userID,
				"type":      "in-app",
				"title":     notificationReq.Title,
				"message":   notificationReq.Message,
				"link":      notificationReq.Link,
				"read":      false,
				"createdAt": now,
				"updatedAt": now,
			})
			if err != nil {
				log.Printf("Error creating in-app notification: %v", err)
			} else {
				sent = true
			}
		}

		// Return the result
		w.Header().Set("Content-Type", "application/json")
		if sent {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success":        true,
				"notificationId": notificationID.Hex(),
				"message":        "Notification sent successfully",
			})
		} else {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": "Failed to send notification",
			})
		}
	}
}

// parseInt converts a string to an integer, with fallback
func parseInt(s string) (int, error) {
	var i int
	var err error
	i, err = parseInt(s)
	if err != nil {
		return 0, err
	}
	return i, nil
}
