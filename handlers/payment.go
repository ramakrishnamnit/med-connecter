
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
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

// RegisterPaymentRoutes registers all payment related routes
func RegisterPaymentRoutes(router *mux.Router, client *mongo.Client, awsConfig *config.AWSConfig) {
	paymentRouter := router.PathPrefix("/api/payments").Subrouter()

	// Register the routes
	paymentRouter.HandleFunc("/initiate", initiatePaymentHandler(client, awsConfig)).Methods("POST")
	paymentRouter.HandleFunc("/webhook", paymentWebhookHandler(client, awsConfig)).Methods("POST")
	paymentRouter.HandleFunc("/status/{id}", getPaymentStatusHandler(client)).Methods("GET")
}

// initiatePaymentHandler initiates a payment for an appointment
func initiatePaymentHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
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
			http.Error(w, "Only patients can make payments", http.StatusForbidden)
			return
		}

		var paymentReq models.PaymentInitiateRequest
		err = json.NewDecoder(r.Body).Decode(&paymentReq)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if paymentReq.AppointmentID == "" {
			http.Error(w, "Appointment ID is required", http.StatusBadRequest)
			return
		}

		// Convert appointment ID to ObjectID
		appointmentID, err := primitive.ObjectIDFromHex(paymentReq.AppointmentID)
		if err != nil {
			http.Error(w, "Invalid appointment ID", http.StatusBadRequest)
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

		// Check if user is the patient for this appointment
		if appointment.PatientID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Check if payment is already completed
		if appointment.PaymentStatus == "paid" {
			http.Error(w, "Payment already completed", http.StatusConflict)
			return
		}

		// Get doctor's consultation fee
		doctorProfilesCollection := config.GetCollection(client, "doctor_profiles")
		var doctorProfile models.DoctorProfile
		err = doctorProfilesCollection.FindOne(ctx, bson.M{"_id": appointment.DoctorID}).Decode(&doctorProfile)
		if err != nil {
			log.Printf("Error finding doctor profile: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Use provided amount or doctor's consultation fee
		amount := paymentReq.Amount
		if amount <= 0 {
			amount = doctorProfile.ConsultationFee
		}

		// Get Mollie API key from Secrets Manager
		mollieAPIKey, err := awsConfig.GetSecret("MOLLIE_API_KEY")
		if err != nil {
			log.Printf("Error getting Mollie API key: %v", err)
			mollieAPIKey = os.Getenv("MOLLIE_API_KEY") // Fallback to env var
			if mollieAPIKey == "" {
				http.Error(w, "Payment provider configuration error", http.StatusInternalServerError)
				return
			}
		}

		// Create a new payment record
		now := time.Now()
		newPayment := models.Payment{
			ID:            primitive.NewObjectID(),
			AppointmentID: appointmentID,
			PatientID:     userID,
			DoctorID:      appointment.DoctorID,
			Amount:        amount,
			Currency:      "EUR",
			Status:        "pending",
			Method:        paymentReq.Method,
			Provider:      "mollie",
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		// Insert payment into database
		paymentsCollection := config.GetCollection(client, "payments")
		_, err = paymentsCollection.InsertOne(ctx, newPayment)
		if err != nil {
			log.Printf("Error creating payment: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Initialize Mollie payment
		// This is a simplified version - in a real app, you'd use the Mollie Go SDK
		// or make a direct API call to Mollie's API
		
		// Create a webhook URL for receiving payment status updates
		webhookURL := fmt.Sprintf("%s/api/payments/webhook", os.Getenv("API_BASE_URL"))
		redirectURL := fmt.Sprintf("%s/payment/success?id=%s", os.Getenv("FRONTEND_URL"), newPayment.ID.Hex())
		
		// Log the payment initialization
		log.Printf("Initiating Mollie payment: Amount: %.2f EUR, WebhookURL: %s, RedirectURL: %s",
			amount, webhookURL, redirectURL)
		
		// In a real implementation, you would make an API call to Mollie here
		// For this example, we'll simulate a successful payment URL generation
		
		// Update payment with provider ID (in real implementation, this would come from Mollie)
		providerID := "tr_" + primitive.NewObjectID().Hex()
		_, err = paymentsCollection.UpdateOne(
			ctx,
			bson.M{"_id": newPayment.ID},
			bson.M{"$set": bson.M{"providerId": providerID}},
		)
		if err != nil {
			log.Printf("Error updating payment with provider ID: %v", err)
		}
		
		// Generate a simulated Mollie payment URL
		paymentURL := fmt.Sprintf("https://www.mollie.com/checkout/%s", providerID)
		
		// Return the payment URL
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.PaymentInitiateResponse{
			PaymentID:   newPayment.ID.Hex(),
			RedirectURL: paymentURL,
		})
	}
}

// paymentWebhookHandler handles payment status updates from Mollie
func paymentWebhookHandler(client *mongo.Client, awsConfig *config.AWSConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var webhookData models.PaymentCallback
		err := json.NewDecoder(r.Body).Decode(&webhookData)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate the webhook data
		if webhookData.ID == "" {
			http.Error(w, "Invalid payment ID", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Get Mollie API key from Secrets Manager
		mollieAPIKey, err := awsConfig.GetSecret("MOLLIE_API_KEY")
		if err != nil {
			log.Printf("Error getting Mollie API key: %v", err)
			mollieAPIKey = os.Getenv("MOLLIE_API_KEY") // Fallback to env var
			if mollieAPIKey == "" {
				http.Error(w, "Payment provider configuration error", http.StatusInternalServerError)
				return
			}
		}

		// In a real implementation, you would verify the payment status with Mollie here
		// For this example, we'll assume the status from the webhook is valid
		
		// Find the payment by provider ID
		paymentsCollection := config.GetCollection(client, "payments")
		var payment models.Payment
		err = paymentsCollection.FindOne(ctx, bson.M{"providerId": webhookData.ID}).Decode(&payment)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Payment not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding payment: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Update payment status
		_, err = paymentsCollection.UpdateOne(
			ctx,
			bson.M{"_id": payment.ID},
			bson.M{"$set": bson.M{"status": webhookData.Status, "updatedAt": time.Now()}},
		)
		if err != nil {
			log.Printf("Error updating payment: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// If payment is successful, update appointment payment status
		if webhookData.Status == "successful" || webhookData.Status == "paid" {
			appointmentsCollection := config.GetCollection(client, "appointments")
			_, err = appointmentsCollection.UpdateOne(
				ctx,
				bson.M{"_id": payment.AppointmentID},
				bson.M{"$set": bson.M{"paymentStatus": "paid", "updatedAt": time.Now()}},
			)
			if err != nil {
				log.Printf("Error updating appointment: %v", err)
				// Continue despite error
			}

			// Send payment confirmation to patient
			// Get patient details
			usersCollection := config.GetCollection(client, "users_auth")
			var patient models.User
			err = usersCollection.FindOne(ctx, bson.M{"_id": payment.PatientID}).Decode(&patient)
			if err == nil && patient.Email != "" {
				// Send email confirmation
				subject := "Payment Confirmation"
				htmlBody := fmt.Sprintf("<p>Your payment of €%.2f for your appointment has been successfully processed.</p>"+
					"<p>Please log in to the platform to view your appointment details.</p>", payment.Amount)
				textBody := fmt.Sprintf("Your payment of €%.2f for your appointment has been successfully processed.\n"+
					"Please log in to the platform to view your appointment details.", payment.Amount)
				
				err = awsConfig.SendEmail(patient.Email, subject, htmlBody, textBody)
				if err != nil {
					log.Printf("Error sending payment confirmation email: %v", err)
					// Continue despite error
				}
			}
		}

		// Return success response
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status": "received"}`))
	}
}

// getPaymentStatusHandler returns the status of a payment
func getPaymentStatusHandler(client *mongo.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		// Convert ID to ObjectID
		paymentID, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			http.Error(w, "Invalid payment ID", http.StatusBadRequest)
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

		// Get the payment
		paymentsCollection := config.GetCollection(client, "payments")
		var payment models.Payment
		err = paymentsCollection.FindOne(ctx, bson.M{"_id": paymentID}).Decode(&payment)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				http.Error(w, "Payment not found", http.StatusNotFound)
			} else {
				log.Printf("Error finding payment: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
			return
		}

		// Check if user is authorized to view this payment
		userRole, _ := r.Context().Value("userRole").(string)
		if userRole == "patient" && payment.PatientID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else if userRole == "doctor" && payment.DoctorID != userID {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Return the payment status
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"paymentId": payment.ID.Hex(),
			"status":    payment.Status,
			"amount":    payment.Amount,
			"currency":  payment.Currency,
			"method":    payment.Method,
			"createdAt": payment.CreatedAt,
		})
	}
}
