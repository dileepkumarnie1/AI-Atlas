# Subscriber Management Guide

## Overview
Subscribers are stored in Firebase Firestore in the `subscribers` collection. Each document represents one subscriber with their email as the document ID.

## Collection Structure

### Collection: `subscribers`
Document ID: Email address (lowercase)

```javascript
{
  email: "user@example.com",           // string (lowercase)
  subscribedAt: Timestamp,              // Firebase server timestamp
  status: "active",                     // "active" | "unsubscribed"
  source: "footer",                     // "footer" | "modal" | "popup"
  metadata: {
    userAgent: "...",                   // Browser user agent
    timestamp: "2025-11-17T..."         // ISO timestamp
  }
}
```

## Firestore Security Rules

The security rules allow:
- ✅ Anyone can CREATE a new subscription (public form)
- ✅ Only admins can READ all subscribers
- ✅ Only admins can UPDATE or DELETE subscriptions

Deploy rules with:
```bash
firebase deploy --only firestore:rules
```

## Exporting Subscribers

### Method 1: Firebase Console
1. Go to Firebase Console → Firestore Database
2. Navigate to `subscribers` collection
3. Export to CSV or JSON

### Method 2: Using Firebase CLI/Script
Create a script to export subscribers:

```javascript
// export-subscribers.js
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function exportSubscribers() {
  const snapshot = await db.collection('subscribers').get();
  const subscribers = [];
  
  snapshot.forEach(doc => {
    subscribers.push({
      email: doc.id,
      ...doc.data()
    });
  });
  
  // Export as CSV
  const csv = subscribers.map(s => s.email).join('\\n');
  fs.writeFileSync('subscribers.csv', csv);
  
  // Export as JSON
  fs.writeFileSync('subscribers.json', JSON.stringify(subscribers, null, 2));
  
  console.log(`Exported ${subscribers.length} subscribers`);
}

exportSubscribers();
```

Run with:
```bash
node export-subscribers.js
```

### Method 3: Direct Firestore Query (Admin SDK)
```javascript
const snapshot = await db.collection('subscribers')
  .where('status', '==', 'active')
  .orderBy('subscribedAt', 'desc')
  .get();

const emails = snapshot.docs.map(doc => doc.data().email);
console.log(emails);
```

## Integration with Email Marketing Platforms

### Mailchimp
1. Export subscribers as CSV
2. Go to Mailchimp → Audience → Import contacts
3. Upload CSV file

### SendGrid
```javascript
// Using SendGrid API
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Add to marketing list
await sgMail.request({
  method: 'PUT',
  url: '/v3/marketing/contacts',
  body: {
    list_ids: ['your-list-id'],
    contacts: subscribers.map(s => ({ email: s.email }))
  }
});
```

### ConvertKit
Use their API to add subscribers programmatically.

## Querying Subscribers

### Get total count
```javascript
const snapshot = await db.collection('subscribers')
  .where('status', '==', 'active')
  .get();
console.log('Total active subscribers:', snapshot.size);
```

### Get recent subscribers
```javascript
const snapshot = await db.collection('subscribers')
  .orderBy('subscribedAt', 'desc')
  .limit(10)
  .get();
```

### Get subscribers by date range
```javascript
const startDate = new Date('2025-01-01');
const endDate = new Date('2025-12-31');

const snapshot = await db.collection('subscribers')
  .where('subscribedAt', '>=', startDate)
  .where('subscribedAt', '<=', endDate)
  .get();
```

## Unsubscribe Functionality (Optional)

To add unsubscribe functionality:

1. Create an unsubscribe page
2. Generate unique tokens for each subscriber
3. Update status to 'unsubscribed'

```javascript
// Update subscriber status
await db.collection('subscribers').doc(email).update({
  status: 'unsubscribed',
  unsubscribedAt: admin.firestore.FieldValue.serverTimestamp()
});
```

## Analytics

Track subscription metrics:
```javascript
// Subscribers per month
const snapshot = await db.collection('subscribers')
  .where('subscribedAt', '>=', firstDayOfMonth)
  .where('subscribedAt', '<=', lastDayOfMonth)
  .get();

console.log('Subscriptions this month:', snapshot.size);
```

## Backup

Regular backups recommended:
```bash
# Export entire Firestore database
gcloud firestore export gs://your-bucket/backups/$(date +%Y%m%d)
```

## Email Campaign Best Practices

1. **Welcome Email**: Send immediately after subscription
2. **Monthly Newsletter**: Batch send using email service
3. **Segmentation**: Group by subscription source or interests
4. **Engagement**: Track open rates and clicks
5. **Compliance**: Include unsubscribe link in all emails

## GDPR Compliance

Ensure compliance by:
- ✅ Getting explicit consent (checkbox)
- ✅ Providing unsubscribe option
- ✅ Ability to delete user data on request
- ✅ Privacy policy link visible during signup

## Troubleshooting

### Issue: Permissions denied
**Solution**: Check Firestore security rules are deployed

### Issue: Duplicate subscriptions
**Solution**: Email is the document ID, so duplicates are automatically prevented

### Issue: Can't see subscribers
**Solution**: Ensure you're logged in as an admin user

## Support

For questions or issues:
- GitHub Issues: https://github.com/dileepkumarnie1/AI-Atlas/issues
- Email: hello@aitoolverse.com
