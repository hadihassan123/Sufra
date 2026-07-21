# 🥐 Sufra

Sufra is a food surplus marketplace that connects bakeries, cafés, restaurants, hotels, grocery stores, and other food businesses with customers looking for discounted surplus food before it goes to waste.

The goal is simple:

> Reduce food waste while helping businesses recover revenue and offering customers affordable meals.

---

# Demo

**Live Website**

https://sufra-fanr.onrender.com

---

# Features

## Customer

- Browse today's surplus food
- View available quantity
- Reserve items instantly
- Cash on pickup
- Receive:
  - 6-character pickup code
  - QR code
- Pickup window displayed clearly
- Mobile-friendly interface

---

## Vendor

Verified vendors can:

- Secure authentication
- Reset password
- Create listings
- Edit listings
- Delete listings
- Update available stock
- Upload listing images
- Upload business logo
- View reservations
- Verify customer pickups
- Search using pickup code
- Scan QR code for instant verification
- Mark reservations as collected

---

## Admin

- Vendor approval
- Vendor rejection
- Manage verification status
- Only verified vendors appear publicly

---

# Reservation Flow

Customer

```
Browse Listings
      ↓
Reserve Item
      ↓
Pickup Code Generated
      ↓
QR Code Generated
      ↓
Pickup at Store
```

Vendor

```
Verify Pickup
      ↓
Enter Pickup Code
        OR
Scan QR Code
      ↓
Confirm Reservation
      ↓
Mark as Collected
```

---

# Tech Stack

## Frontend

- HTML5
- CSS3
- Vanilla JavaScript

## Backend

- Supabase

### Database

- PostgreSQL

### Authentication

- Supabase Auth

### Storage

- Supabase Storage

### Hosting

- Render

---

# Database

Main tables

```
vendors
listings
reservations
```

Relationships

```
Vendor
   │
   ├── Listings
   │
   └── Reservations
```

---

# Project Structure

```
.
├── admin.html
├── index.html
├── vendor-dashboard.html
├── vendor-login.html
├── vendor-signup.html
├── vendor-forgot-password.html
├── vendor-reset-password.html
│
├── css
│   └── style.css
│
├── js
│   ├── customer.js
│   ├── vendor.js
│   ├── store.js
│   └── supabase-client.js
│
├── images
│
└── supabase
    ├── schema.sql
    └── admin_setup.sql
```

---

# Security

Implemented

- HTTPS
- Supabase Authentication
- Row Level Security (RLS)
- Vendor verification workflow
- Secure image storage
- Content Security Policy (CSP)
- Permissions Policy
- QR-based pickup verification
- Pickup code verification
- Server-side reservation validation

Security tested with

- OWASP ZAP

---

# QR Pickup Verification

Each reservation generates

- Unique QR Code
- Unique Pickup Code

Vendor can

- Scan QR code
- Enter pickup code manually

Only the vendor who owns the reservation can mark it as collected.

---

# Image Uploads

Supported

- JPG
- PNG
- WebP

Stored securely using

- Supabase Storage

---

# Business Verification

New vendors are hidden from customers until approved.

Workflow

```
Vendor Signup
        ↓
Upload Documents
        ↓
Admin Review
        ↓
Verified
        ↓
Listings Become Public
```

---

# Current Payment Method

Currently supported

- Cash at Pickup

Planned

- SkipCash
- Online Payments

---

# Future Roadmap

## Sprint 1 ✅

- Vendor authentication
- Listings
- Reservations
- Pickup codes
- QR verification

## Sprint 2

- Reservation cancellation
- Customer reservation history
- Push notifications
- Email confirmations

## Sprint 3

- Online payments
- Ratings & reviews
- Vendor analytics
- Sales dashboard
- Inventory insights

---

# Installation

Clone

```bash
git clone https://github.com/hadihassan123/Sufra.git
```

Enter directory

```bash
cd Sufra
```

Open

```
index.html
```

or deploy using any static hosting provider.

---

# Supabase Setup

Create a project.

Run

```
supabase/schema.sql
```

Then

```
supabase/admin_setup.sql
```

Update

```
js/supabase-client.js
```

with

```
SUPABASE_URL
SUPABASE_ANON_KEY
```

---

# Deployment

Currently deployed using

- Render Static Site

Future deployment options

- Cloudflare Pages
- Vercel
- Netlify

---

# Browser Support

- Chrome
- Edge
- Firefox
- Brave
- Safari

---

# License

MIT License

---

# Author

**Hadi Hassan**

GitHub

https://github.com/hadihassan123

---

# Acknowledgements

- Supabase
- Render
- QRCode.js
- html5-qrcode
- OWASP ZAP

---

## Mission

Reduce food waste.

Support local businesses.

Make good food affordable.

One reservation at a time.

# 🚀 Roadmap

## ✅ Version 1.0 (Current)

### Customer
- [x] Browse surplus food
- [x] View food details
- [x] Reserve listings
- [x] Cash at pickup
- [x] Pickup code generation
- [x] QR code generation
- [x] Responsive homepage

### Vendor
- [x] Vendor authentication
- [x] Password reset
- [x] Upload business logo
- [x] Upload listing images
- [x] Create listings
- [x] Edit listings
- [x] Delete listings
- [x] Manage stock
- [x] View reservations
- [x] Verify using pickup code
- [x] Verify using QR scanner
- [x] Mark reservations as collected

### Admin
- [x] Vendor approval
- [x] Vendor verification
- [x] Hide unverified vendors
- [x] Manage vendors

### Security
- [x] HTTPS
- [x] Supabase Authentication
- [x] Row Level Security (RLS)
- [x] Content Security Policy (CSP)
- [x] QR verification
- [x] OWASP ZAP security testing

---

## 🚧 Version 1.1

### Customer Accounts
- [ ] Customer registration
- [ ] Customer login
- [ ] Email verification
- [ ] Phone verification

### Reservations
- [ ] My Reservations
- [ ] Reservation history
- [ ] Cancel reservation
- [ ] Reservation status tracking

### Vendor
- [ ] Reservation search
- [ ] Reservation filters
- [ ] Sales history
- [ ] Daily reports

---

## 🚧 Version 1.2

### Payments
- [ ] SkipCash integration
- [ ] Card payments
- [ ] Payment confirmation
- [ ] Refund support

### Notifications
- [ ] Email notifications
- [ ] SMS notifications
- [ ] Pickup reminders
- [ ] Reservation confirmation emails

---

## 🚧 Version 1.3

### Customer Experience
- [ ] Favorites
- [ ] Reviews
- [ ] Ratings
- [ ] Recommended listings
- [ ] Search
- [ ] Category filters
- [ ] Map view

---

## 🚧 Version 1.4

### Vendor Dashboard
- [ ] Revenue analytics
- [ ] Waste reduction statistics
- [ ] Popular items
- [ ] Inventory insights
- [ ] Sales charts
- [ ] Export reports

---

## 🚧 Version 2.0

### Marketplace
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Mobile app
- [ ] Push notifications
- [ ] Loyalty program
- [ ] Coupons
- [ ] Referral system
- [ ] AI demand prediction
- [ ] AI pricing recommendations

---

## Long-Term Vision

- Become the leading surplus-food marketplace in Qatar.
- Expand across GCC countries.
- Reduce food waste through technology.
- Help businesses recover revenue from unsold food.
- Provide affordable meals while promoting sustainability.