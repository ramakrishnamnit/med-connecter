
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"practo-clone/config"
	"practo-clone/models"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections (in production, this should be restricted)
	},
}

// Map of appointment IDs to connected clients
var clients = make(map[string]map[*websocket.Conn]bool)

// RegisterChatRoutes registers all chat related routes
func RegisterChatRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	chatRouter := router.PathPrefix("/api/chats").Subrouter()

	// Register the routes
	chatRouter.HandleFunc("/{appointmentId}", getChatHistoryHandler(client)).Methods("GET")
	chatRouter.HandleFunc("/{appointmentId}/ws", chatWebSocketHandler(client)).Methods("GET")
	chatRouter.HandleFunc("/{appointmentId}/message", sendMessageHandler(client)).Methods("POST")
}

// getChatHistoryHandler returns the chat history for an appointment
func getChatHistoryHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		appointmentIDStr := vars["appointmentId"]

		// Convert appointment ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(appointmentIDStr)
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
		if appointment.PatientID != userID && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Get or create chat for this appointment
		chatsCollection := config.GetCollection(client, "chats")
		var chat models.Chat
		err = chatsCollection.FindOne(ctx, bson.M{"appointmentId": appointmentID}).Decode(&chat)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				// Create a new chat
				now := time.Now()
				chat = models.Chat{
					ID:           primitive.NewObjectID(),
					AppointmentID: appointmentID,
					PatientID:    appointment.PatientID,
					DoctorID:     appointment.DoctorID,
					Messages:     []models.Message{},
					CreatedAt:    now,
					UpdatedAt:    now,
				}

				_, err = chatsCollection.InsertOne(ctx, chat)
				if err != nil {
					log.Printf("Error creating chat: %v", err)
					http.Error(w, "Internal server error", http.StatusInternalServerError)
					return
				}
			} else {
				log.Printf("Error finding chat: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}

		// Get user profiles for the patient and doctor
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var patientProfile, doctorProfile models.UserProfile
		
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": appointment.PatientID}).Decode(&patientProfile)
		if err != nil {
			log.Printf("Error finding patient profile: %v", err)
			// Continue without patient name
		}

		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": appointment.DoctorID}).Decode(&doctorProfile)
		if err != nil {
			log.Printf("Error finding doctor profile: %v", err)
			// Continue without doctor name
		}

		// Map messages to response format
		messageResponses := make([]models.MessageResponse, len(chat.Messages))
		for i, message := range chat.Messages {
			senderName := ""
			if message.SenderID == appointment.PatientID {
				senderName = patientProfile.FullName
			} else if message.SenderID == appointment.DoctorID {
				senderName = doctorProfile.FullName
			}

			messageResponses[i] = models.MessageResponse{
				ID:        message.ID,
				SenderID:  message.SenderID,
				SenderName: senderName,
				Content:   message.Content,
				Type:      message.Type,
				Timestamp: message.Timestamp,
			}
		}

		// Create response
		response := models.ChatResponse{
			ID:           chat.ID,
			AppointmentID: chat.AppointmentID,
			PatientID:    chat.PatientID,
			DoctorID:     chat.DoctorID,
			PatientName:  patientProfile.FullName,
			DoctorName:   doctorProfile.FullName,
			Messages:     messageResponses,
			CreatedAt:    chat.CreatedAt,
		}

		// Return the chat history
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// sendMessageHandler sends a message to a chat
func sendMessageHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		appointmentIDStr := vars["appointmentId"]

		// Convert appointment ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(appointmentIDStr)
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

		var messageReq models.ChatMessageRequest
		err = json.NewDecoder(r.Body).Decode(&messageReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if messageReq.Content == "" {
			http.Error(w, "Message content is required", http.StatusBadRequest)
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
		if appointment.PatientID != userID && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Get or create chat for this appointment
		chatsCollection := config.GetCollection(client, "chats")
		var chat models.Chat
		err = chatsCollection.FindOne(ctx, bson.M{"appointmentId": appointmentID}).Decode(&chat)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				// Create a new chat
				now := time.Now()
				chat = models.Chat{
					ID:           primitive.NewObjectID(),
					AppointmentID: appointmentID,
					PatientID:    appointment.PatientID,
					DoctorID:     appointment.DoctorID,
					Messages:     []models.Message{},
					CreatedAt:    now,
					UpdatedAt:    now,
				}

				_, err = chatsCollection.InsertOne(ctx, chat)
				if err != nil {
					log.Printf("Error creating chat: %v", err)
					http.Error(w, "Internal server error", http.StatusInternalServerError)
					return
				}
			} else {
				log.Printf("Error finding chat: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}

		// Create a new message
		now := time.Now()
		message := models.Message{
			ID:        primitive.NewObjectID(),
			SenderID:  userID,
			Content:   messageReq.Content,
			Type:      messageReq.Type,
			Timestamp: now,
		}

		// Add message to chat
		_, err = chatsCollection.UpdateOne(
			ctx,
			bson.M{"_id": chat.ID},
			bson.M{
				"$push": bson.M{"messages": message},
				"$set":  bson.M{"updatedAt": now},
			},
		)
		if err != nil {
			log.Printf("Error adding message to chat: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Get user profile for the sender
		userProfilesCollection := config.GetCollection(client, "users_profile")
		var senderProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": userID}).Decode(&senderProfile)
		if err != nil {
			log.Printf("Error finding sender profile: %v", err)
			// Continue without sender name
		}

		// Create message response
		messageResponse := models.MessageResponse{
			ID:        message.ID,
			SenderID:  message.SenderID,
			SenderName: senderProfile.FullName,
			Content:   message.Content,
			Type:      message.Type,
			Timestamp: message.Timestamp,
		}

		// Broadcast message to connected clients
		if chatClients, ok := clients[appointmentIDStr]; ok {
			messageJSON, _ := json.Marshal(messageResponse)
			for conn := range chatClients {
				err := conn.WriteMessage(websocket.TextMessage, messageJSON)
				if err != nil {
					log.Printf("Error broadcasting message: %v", err)
					conn.Close()
					delete(chatClients, conn)
				}
			}
		}

		// Return the message
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messageResponse)
	}
}

// chatWebSocketHandler handles WebSocket connections for real-time chat
func chatWebSocketHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		appointmentIDStr := vars["appointmentId"]

		// Convert appointment ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(appointmentIDStr)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
			return
		}

		// Get the token from query parameter
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "Authentication token is required", http.StatusUnauthorized)
			return
		}

		// Verify the token and get user ID
		// In a real implementation, you would use JWT verification
		// For simplicity, we'll assume the token is valid and contains the user ID
		userID, err := primitive.ObjectIDFromHex(token)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
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
		if appointment.PatientID != userID && appointment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Upgrade the HTTP connection to a WebSocket connection
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("Error upgrading to WebSocket: %v", err)
			return
		}

		// Add the connection to the clients map
		if _, ok := clients[appointmentIDStr]; !ok {
			clients[appointmentIDStr] = make(map[*websocket.Conn]bool)
		}
		clients[appointmentIDStr][conn] = true

		// Start a goroutine for handling incoming messages
		go handleWebSocketMessages(client, conn, appointmentIDStr, userID)
	}
}

// handleWebSocketMessages handles incoming WebSocket messages
func handleWebSocketMessages(mongoClient *mongo.Client, conn *websocket.Conn, appointmentIDStr string, userID primitive.ObjectID) {
	defer func() {
		conn.Close()
		if chatClients, ok := clients[appointmentIDStr]; ok {
			delete(chatClients, conn)
			if len(chatClients) == 0 {
				delete(clients, appointmentIDStr)
			}
		}
	}()

	appointmentID, _ := primitive.ObjectIDFromHex(appointmentIDStr)

	for {
		// Read message from the WebSocket
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		// Parse the message
		var messageReq struct {
			Content string `json:"content"`
			Type    string `json:"type"`
		}
		err = json.Unmarshal(msg, &messageReq)
		if err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		// Create a new message
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		now := time.Now()
		message := models.Message{
			ID:        primitive.NewObjectID(),
			SenderID:  userID,
			Content:   messageReq.Content,
			Type:      messageReq.Type,
			Timestamp: now,
		}

		// Add message to chat
		chatsCollection := config.GetCollection(mongoClient, "chats")
		_, err = chatsCollection.UpdateOne(
			ctx,
			bson.M{"appointmentId": appointmentID},
			bson.M{
				"$push": bson.M{"messages": message},
				"$set":  bson.M{"updatedAt": now},
			},
		)
		cancel()
		if err != nil {
			log.Printf("Error adding message to chat: %v", err)
			continue
		}

		// Get user profile for the sender
		ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
		userProfilesCollection := config.GetCollection(mongoClient, "users_profile")
		var senderProfile models.UserProfile
		err = userProfilesCollection.FindOne(ctx, bson.M{"userId": userID}).Decode(&senderProfile)
		cancel()
		if err != nil {
			log.Printf("Error finding sender profile: %v", err)
			// Continue without sender name
		}

		// Create message response
		messageResponse := models.MessageResponse{
			ID:        message.ID,
			SenderID:  message.SenderID,
			SenderName: senderProfile.FullName,
			Content:   message.Content,
			Type:      message.Type,
			Timestamp: message.Timestamp,
		}

		// Broadcast message to all connected clients
		if chatClients, ok := clients[appointmentIDStr]; ok {
			messageJSON, _ := json.Marshal(messageResponse)
			for client := range chatClients {
				err := client.WriteMessage(websocket.TextMessage, messageJSON)
				if err != nil {
					log.Printf("Error broadcasting message: %v", err)
					client.Close()
					delete(chatClients, client)
				}
			}
		}
	}
}
