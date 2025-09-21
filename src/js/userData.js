// --- ADMIN / MODERATOR ROLES ---
// Set user role (admin, moderator, user)
export async function setUserRole(uid, role) {
  // Only callable by an admin in a secure context (not exposed to regular users)
  await setDoc(doc(db, "users", uid), { role }, { merge: true });
}

// Get user role
export async function getUserRole(uid) {
  const docSnap = await getDoc(doc(db, "users", uid));
  return docSnap.exists() ? docSnap.data().role || "user" : "user";
}

// Check if current user is admin or moderator
export async function isCurrentUserAdminOrMod() {
  const user = auth.currentUser;
  if (!user) return false;
  const role = await getUserRole(user.uid);
  return role === "admin" || role === "moderator";
}
// --- COMPARISON LISTS ---
// Add or update a comparison list
export async function setComparisonList(listId, listData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await setDoc(doc(db, "users", user.uid, "comparisons", listId), {
    ...listData,
    updatedAt: new Date().toISOString()
  });
}

// Get all comparison lists
export async function getComparisonLists() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const compCol = collection(db, "users", user.uid, "comparisons");
  const compSnap = await getDocs(compCol);
  return compSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Remove a comparison list
export async function removeComparisonList(listId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await deleteDoc(doc(db, "users", user.uid, "comparisons", listId));
}
// User data management functions for Firestore
import { auth, db } from "./firebase";
import { doc, setDoc, getDoc, collection, getDocs, updateDoc, deleteDoc } from "firebase/firestore";


// Add or update user profile (supports displayName, avatar, preferences, etc.)
export async function setUserProfile(profileData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await setDoc(doc(db, "users", user.uid), { profile: { ...profileData } }, { merge: true });
}

// Get user profile (returns { displayName, avatar, preferences, ... })
export async function getUserProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const docSnap = await getDoc(doc(db, "users", user.uid));
  return docSnap.exists() ? docSnap.data().profile : null;
}

// Update a specific profile field (e.g., displayName, avatar, preferences)
export async function updateUserProfileField(field, value) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await setDoc(doc(db, "users", user.uid), { profile: { [field]: value } }, { merge: true });
}

// Get user preferences
export async function getUserPreferences() {
  const profile = await getUserProfile();
  return profile?.preferences || {};
}

// Set user preferences
export async function setUserPreferences(preferences) {
  return updateUserProfileField('preferences', preferences);
}

// Add a favorite tool
export async function addFavorite(toolId, toolData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await setDoc(doc(db, "users", user.uid, "favorites", toolId), {
    ...toolData,
    addedAt: new Date().toISOString()
  });
}

// Remove a favorite tool
export async function removeFavorite(toolId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await deleteDoc(doc(db, "users", user.uid, "favorites", toolId));
}

// Get all favorite tools
export async function getFavorites() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const favsCol = collection(db, "users", user.uid, "favorites");
  const favsSnap = await getDocs(favsCol);
  return favsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Add a review
export async function addReview(reviewId, reviewData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await setDoc(doc(db, "users", user.uid, "reviews", reviewId), {
    ...reviewData,
    createdAt: new Date().toISOString()
  });
}

// Get all reviews by user
export async function getReviews() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const reviewsCol = collection(db, "users", user.uid, "reviews");
  const reviewsSnap = await getDocs(reviewsCol);
  return reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Update a review
export async function updateReview(reviewId, reviewData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await updateDoc(doc(db, "users", user.uid, "reviews", reviewId), reviewData);
}

// Remove a review
export async function removeReview(reviewId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await deleteDoc(doc(db, "users", user.uid, "reviews", reviewId));
}
