# Footer Links & Subscription Implementation Plan

## Footer Links Mapping

### Categories Section
Map to actual domain slugs:
- **Productivity Tools** → `productivity`
- **Image Generators** → `image-generation`
- **Text Generators** → `language-chat`
- **Video Tools** → `video-tools`
- **Art Generators** → `design-tools`
- **Audio Generators** → `audio-music`
- **All AI Tools** → Homepage (all domains)

### Resources Section
These should filter by specific use cases or show curated lists:
- **Best AI Art Generators** → `design-tools` with sorting
- **Best AI Image Generators** → `image-generation` with sorting
- **Best AI Chatbots** → `language-chat` with sorting
- **Best AI Text Generators** → `language-chat` with text generation filter
- **Best AI 3D Generators** → `3d-modeling`
- **All Resources** → Link to a resources/blog page (future)

### Company Section
- **Contact Us** → mailto link or contact form
- **Advertise** → mailto or dedicated page
- **Submit a Tool** → Already exists in header nav
- **Request a Feature** → GitHub issues or feedback form
- **Update a Tool** → Form for tool updates

### Social Links
- **LinkedIn** → Your LinkedIn profile/page
- **Twitter** → Your Twitter handle
- **YouTube** → Your YouTube channel
- **Instagram** → Your Instagram
- **Facebook** → Your Facebook page

## Firebase Subscription Storage

### Firestore Collection Structure
```
subscribers/
  └── {subscriberEmail}/
      ├── email: string
      ├── subscribedAt: timestamp
      ├── status: 'active' | 'unsubscribed'
      ├── source: 'footer' | 'modal' | etc
      └── metadata: {
           userAgent: string,
           ipCountry: string (optional)
          }
```

### Benefits of Firebase Storage:
1. ✅ Real-time updates
2. ✅ Easy export for email marketing
3. ✅ Can track subscription metrics
4. ✅ Built-in security rules
5. ✅ No server needed

### Security Rules for Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to add their own subscription
    match /subscribers/{email} {
      allow create: if request.auth == null 
                    && request.resource.data.email == email
                    && request.resource.data.subscribedAt == request.time;
      allow read: if request.auth.token.admin == true;
      allow update, delete: if request.auth.token.admin == true;
    }
  }
}
```

## Implementation Steps

1. **Update footer links with proper hrefs**
2. **Add click handlers for category/domain navigation**
3. **Replace mailto with Firebase subscription**
4. **Add Firestore security rules**
5. **Test subscription flow**
6. **Add unsubscribe functionality (optional)**

## Additional Features (Optional)
- Email validation with better UX
- Double opt-in confirmation
- Welcome email (using Firebase Functions)
- Subscription preferences
- Export to CSV for email marketing tools
