// app.js
require('dotenv').config();
const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const fs = require("fs");
const { db, storage } = require("./firebase"); // Import the Firebase setup

const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

// Set up Multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit
  },
});

// Serve the index.html page
app.get("/", (req, res) => {
  res.render("home");
});

app.get("/firebase", (req, res) => {
  res.render("firebase");
});

// Example: Creating a 'users' collection in Firestore using the Admin SDK
// You can run this code once to create the collection if it doesn't exist.
const createUsersCollection = async () => {
  try {
    // Use the admin.firestore() instance to interact with Firestore
    const usersCollectionRef = db.collection("users");

    // Check if the 'users' collection already exists
    const snapshot = await usersCollectionRef.get();
    if (snapshot.empty) {
      // Create the 'users' collection (if it doesn't exist)
      await usersCollectionRef.add({
        sampleData: "This is a sample document inside the users collection.",
      });

      console.log('Collection "users" created successfully!');
    } else {
      console.log('Collection "users" already exists.');
    }
  } catch (error) {
    console.error('Error creating "users" collection:', error);
  }
};

// Call the function to create the collection (optional, if you haven't created it yet)
createUsersCollection();

// Handle image upload
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (
      !req.file ||
      !req.body.name ||
      !req.body.phone ||
      !req.body.email ||
      !req.body.dob
    ) {
      res
        .status(400)
        .send("Please fill out all the required fields and upload an image.");
      return;
    }

    const file = req.file;
    const name = req.body.name;
    const phone = req.body.phone;
    const email = req.body.email;
    const dob = req.body.dob;
    const imageRef = storage.bucket().file(file.originalname);

    const metadata = {
      contentType: file.mimetype,
    };

    // Upload the image to Firebase Storage
    await imageRef.save(file.buffer, { metadata });

    // Save image metadata to Firestore
    const imageUrl = await imageRef.getSignedUrl({
      action: "read",
      expires: "03-09-2491",
    }); // Adjust expiration date as needed

    await db.collection("users").add({
      name,
      phone,
      email,
      dob,
      imageName: file.originalname,
      imageUrl: imageUrl[0],
      createdAt: new Date(),
    });

    res.redirect("/firebase");
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send("Error uploading image.");
  }
});

// Get all uploaded images
app.get("/users", async (req, res) => {
  try {
    const imagesSnapshot = await db
      .collection("users")
      .orderBy("createdAt", "desc")
      .get();
    const images = imagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(images);
  } catch (error) {
    res.status(500).send("Error retrieving images.");
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) {
      res.status(404).send("User not found.");
      return;
    }

    const user = userDoc.data();
    res.json(user);
  } catch (error) {
    res.status(500).send("Error retrieving user.");
  }
});

// Edit image
app.patch("/users/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const name = req.body.name;
    const phone = req.body.phone; // New field: phone
    const email = req.body.email; // New field: email
    const dob = req.body.dob; // New field: dateOfBirth
    const file = req.file;

    // Update the user's information in Firestore
    await db.collection("users").doc(id).update({
      name,
      phone, // New field: phone
      email, // New field: email
      dob, // New field: dateOfBirth
    });

    // Handle image update if provided
    if (file) {
      const imageRef = storage.bucket().file(file.originalname);
      const metadata = {
        contentType: file.mimetype,
      };

      // Upload the new image to Firebase Storage
      await imageRef.save(file.buffer, { metadata });

      // Save the new image metadata to Firestore
      const imageUrl = await imageRef.getSignedUrl({
        action: "read",
        expires: "03-09-2491",
      }); // Adjust expiration date as needed
      await db
        .collection("users")
        .doc(id)
        .update({ imageName: file.originalname, imageUrl: imageUrl[0] });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error updating image:", error);
    res.status(500).send("Error updating image.");
  }
});

// Delete image
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Image ID to delete:", id); // Log the image ID for debugging

    // Delete the image from Firestore
    await db.collection("users").doc(id).delete();

    // Delete the image from Firebase Storage
    const imageRef = storage.bucket().file(id);
    await imageRef.delete();

    res.sendStatus(200);
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).send("Error deleting image.");
  }
});

///////////////// Logic for local Storage ///////////////
const userDataFilePath = "./data/localUsers.json";

// Render the form to collect user information
app.get("/local", (req, res) => {
  const localUsers = readUserData();
  res.render("local", { localUsers, user: undefined, userId: undefined });
});

const readUserData = () => {
  try {
    const rawData = fs.readFileSync(userDataFilePath);
    let localUsers = JSON.parse(rawData);

    // Ensure localUsers is an array
    if (!Array.isArray(localUsers)) {
      localUsers = [];
    }

    return localUsers;
  } catch (err) {
    console.error("Error reading user data:", err);
    return [];
  }
};

// Helper function to write the user data to the JSON file
const writeUserData = (userData) => {
  fs.writeFileSync(userDataFilePath, JSON.stringify(userData, null, 2));
};

// Handle form submission
app.post("/add", (req, res) => {
  const { name, phone, email, dob } = req.body;
  const localUsers = readUserData();
  localUsers.push({ name, phone, email, dob });
  writeUserData(localUsers);
  res.redirect("/local");
});

// Render the edit form
app.get("/edit/:id", (req, res) => {
  const userId = req.params.id;
  const localUsers = readUserData();
  const user = localUsers[userId];
  res.render("local", { localUsers, user, userId });
});

// Handle edit form submission
app.post("/edit/:id", (req, res) => {
  const userId = req.params.id;
  const { name, phone, email, dob } = req.body;
  const localUsers = readUserData();
  localUsers[userId] = { name, phone, email, dob };
  writeUserData(localUsers);
  res.redirect("/local");
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
