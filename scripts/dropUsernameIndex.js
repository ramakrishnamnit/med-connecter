const mongoose = require('mongoose');
const config = require('../config/config');

async function dropUsernameIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongo.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Get the users collection
    const usersCollection = mongoose.connection.collection('users');

    // Drop the username index
    await usersCollection.dropIndex('username_1');
    console.log('Successfully dropped username index');

    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
dropUsernameIndex(); 