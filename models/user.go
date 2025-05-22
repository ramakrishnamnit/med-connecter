
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// User represents a user in the system
type User struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email           string             `bson:"email" json:"email"`
	PasswordHash    string             `bson:"passwordHash" json:"-"`
	Phone           string             `bson:"phone" json:"phone"`
	IsEmailVerified bool               `bson:"isEmailVerified" json:"isEmailVerified"`
	IsMobileVerified bool              `bson:"isMobileVerified" json:"isMobileVerified"`
	Role            string             `bson:"role" json:"role"` // patient, doctor, admin
	CreatedAt       time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// UserProfile represents a user's profile information
type UserProfile struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID       primitive.ObjectID `bson:"userId" json:"userId"`
	FullName     string             `bson:"fullName" json:"fullName"`
	DOB          time.Time          `bson:"dob" json:"dob"`
	Gender       string             `bson:"gender" json:"gender"`
	Address      string             `bson:"address" json:"address"`
	City         string             `bson:"city" json:"city"`
	Country      string             `bson:"country" json:"country"`
	PostalCode   string             `bson:"postalCode" json:"postalCode"`
	Languages    []string           `bson:"languages" json:"languages"`
	ProfileImage string             `bson:"profileImage" json:"profileImage"`
	CreatedAt    time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// DoctorProfile represents a doctor's professional information
type DoctorProfile struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID            primitive.ObjectID `bson:"userId" json:"userId"`
	Specialties       []string           `bson:"specialties" json:"specialties"`
	LicenseNumber     string             `bson:"licenseNumber" json:"licenseNumber"`
	BIGNumber         string             `bson:"bigNumber" json:"bigNumber"`
	IsVerified        bool               `bson:"isVerified" json:"isVerified"`
	VerificationStatus string             `bson:"verificationStatus" json:"verificationStatus"`
	Bio               string             `bson:"bio" json:"bio"`
	Experience        int                `bson:"experience" json:"experience"` // in years
	Education         []Education        `bson:"education" json:"education"`
	ConsultationFee   float64            `bson:"consultationFee" json:"consultationFee"`
	Availability      []Availability     `bson:"availability" json:"availability"`
	CreatedAt         time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt         time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Education represents a doctor's educational background
type Education struct {
	Degree        string    `bson:"degree" json:"degree"`
	Institution   string    `bson:"institution" json:"institution"`
	Year          int       `bson:"year" json:"year"`
}

// Availability represents a doctor's available time slots
type Availability struct {
	DayOfWeek  string    `bson:"dayOfWeek" json:"dayOfWeek"`
	StartTime  string    `bson:"startTime" json:"startTime"`
	EndTime    string    `bson:"endTime" json:"endTime"`
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RegisterRequest represents registration details
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
	FullName string `json:"fullName"`
}

// AuthResponse represents authentication response
type AuthResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
	UserID       string `json:"userId"`
	Role         string `json:"role"`
}
