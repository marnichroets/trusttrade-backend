# TrustTrade - Professional Escrow Platform

A secure peer-to-peer transaction escrow platform built with React, FastAPI, and MongoDB.

## 🎯 Features

### Core Functionality
- **Secure Escrow**: Funds held securely until delivery confirmation
- **Google OAuth Authentication**: Powered by Emergent Auth
- **Transaction Management**: Create, track, and manage escrow transactions
- **2% Service Fee**: Automatic calculation on all transactions
- **Delivery Confirmation**: Buyers confirm receipt before fund release
- **Dispute Resolution**: Built-in dispute management system
- **Admin Dashboard**: Complete oversight for administrators
- **Privacy Controls**: Users see only their data; admins see everything

### User Roles
- **Buyer**: Create transactions, confirm delivery, raise disputes
- **Seller**: Receive notifications, await delivery confirmation
- **Admin** (marnichr@gmail.com): Full system access, dispute management, user oversight

### Transaction Flow
1. **Create Transaction**: Buyer creates transaction with seller details and item info
2. **Seller Delivers**: Seller provides product/service
3. **Buyer Confirms**: Buyer confirms delivery satisfaction
4. **Funds Released**: Payment automatically released to seller

## 💻 Tech Stack

### Frontend
- React 19
- React Router DOM 7.5
- Tailwind CSS 3.4
- Shadcn/UI Components
- Axios for API calls
- Sonner for toast notifications

### Backend
- FastAPI 0.110
- Motor (async MongoDB driver) 3.3
- Pydantic for data validation
- httpx for external API calls
- emergentintegrations for OAuth

### Database
- MongoDB (async operations)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.11+
- MongoDB
- Yarn package manager

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd trust-trade-pay
```

2. **Backend Setup**
```bash
cd backend
pip install -r requirements.txt
```

3. **Frontend Setup**
```bash
cd frontend
yarn install
```

### Environment Variables

**Backend (.env)**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
CORS_ORIGINS=*
```

**Frontend (.env)**
```
REACT_APP_BACKEND_URL=https://trust-trade-pay.preview.emergentagent.com
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

### Running the Application

**Backend**
```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend**
```bash
cd frontend
yarn start
```

The app will be available at `http://localhost:3000`

## 📱 Pages & Routes

### Public Routes
- `/` - Landing page with features and call-to-action

### Protected Routes (require authentication)
- `/dashboard` - User dashboard with stats and recent transactions
- `/transactions/new` - Create new transaction
- `/transactions` - List all transactions (filtered by user)
- `/transactions/:id` - Transaction detail with actions
- `/disputes` - Raise and view disputes
- `/admin` - Admin dashboard (admin only)

## 🔐 Authentication

Uses Emergent Google OAuth:
- Click "Sign Up" or "Log In" on landing page
- Redirects to Google OAuth via Emergent Auth
- Returns with session token stored in httpOnly cookie
- Session valid for 7 days

### Admin Access
The email `marnichr@gmail.com` automatically receives admin privileges.

## 💰 Fee Structure

- **Transaction Fee**: 2% of item price
- **Calculation**: Automatic on transaction creation
- **Example**: R 10,000 item → R 200 fee → R 10,200 total
- **Display**: All amounts shown in South African Rand (R)

## 🗄️ Database Schema

### Users Collection
```javascript
{
  user_id: "user_abc123",        // Custom UUID
  email: "user@example.com",
  name: "User Name",
  picture: "https://...",
  role: "buyer",                  // or "admin"
  is_admin: false,                // true for marnichr@gmail.com
  created_at: "2026-02-24T..."
}
```

### Transactions Collection
```javascript
{
  transaction_id: "txn_abc123",
  buyer_user_id: "user_abc123",
  buyer_name: "Buyer Name",
  buyer_email: "buyer@example.com",
  seller_name: "Seller Name",
  seller_email: "seller@example.com",
  item_description: "Product description",
  item_price: 10000.00,
  trusttrade_fee: 200.00,
  total: 10200.00,
  payment_status: "Pending",      // Pending | Paid | Released
  delivery_confirmed: false,
  release_status: "Not Released", // Not Released | Released
  created_at: "2026-02-24T..."
}
```

### Disputes Collection
```javascript
{
  dispute_id: "disp_abc123",
  transaction_id: "txn_abc123",
  raised_by_user_id: "user_abc123",
  description: "Issue description",
  status: "Pending",              // Pending | Resolved
  created_at: "2026-02-24T..."
}
```

### User Sessions Collection
```javascript
{
  user_id: "user_abc123",
  session_token: "session_token_xyz",
  expires_at: "2026-03-03T...",
  created_at: "2026-02-24T..."
}
```

## 🎨 Design System

### Colors
- **Primary**: #1E5EFF (Royal Blue)
- **Primary Light**: #EAF2FF
- **Background**: #FFFFFF (White)
- **Muted**: #F8FAFC
- **Border**: #E2E8F0
- **Success**: #10B981 (Green)
- **Warning**: #F59E0B (Yellow)
- **Destructive**: #EF4444 (Red)

### Typography
- **Headings**: Manrope (sans-serif)
- **Body**: Inter (sans-serif)
- **Monospace**: JetBrains Mono

### Animations
- Minimal and professional
- Hover effects on cards and buttons
- Smooth transitions (200ms)
- Active state scaling on buttons

## 🔒 Privacy & Security

### Privacy Rules
1. **Regular Users**: See only their own transactions and disputes
2. **Admin Users**: See all data across the platform
3. **Data Filtering**: Applied at both API and UI levels

### Security Features
- HttpOnly cookies for session tokens
- CORS protection
- MongoDB `_id` exclusion from API responses
- Custom UUID system for user identification
- Timezone-aware datetime handling

## 📧 Email Notifications (Mocked)

Email notifications are currently mocked (logged to console). Integration points:
- Transaction created → buyer, seller, admin
- Delivery confirmed → seller, admin
- Dispute raised → admin
- Payment status updated → involved parties

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest backend_test.py
```

### Manual Testing
See `/app/auth_testing.md` for authentication testing playbook.

### Test Coverage
- ✅ Authentication (OAuth, sessions, logout)
- ✅ Transaction CRUD operations
- ✅ Fee calculation (2%)
- ✅ Delivery confirmation workflow
- ✅ Dispute management
- ✅ Admin functionality
- ✅ Privacy rules enforcement
- ✅ Mobile responsiveness

## 📊 API Endpoints

### Authentication
- `POST /api/auth/session` - Exchange session_id for user data
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout and clear session

### Transactions
- `POST /api/transactions` - Create transaction (201)
- `GET /api/transactions` - List user transactions
- `GET /api/transactions/:id` - Get transaction details
- `PATCH /api/transactions/:id/delivery` - Confirm delivery

### Disputes
- `POST /api/disputes` - Create dispute (201)
- `GET /api/disputes` - List user disputes
- `PATCH /api/disputes/:id` - Update dispute status (admin)

### Admin
- `GET /api/admin/users` - List all users
- `GET /api/admin/transactions` - List all transactions
- `GET /api/admin/disputes` - List all disputes
- `GET /api/admin/stats` - Get dashboard statistics

## 🐛 Troubleshooting

### Common Issues

**Backend not starting**
```bash
# Check logs
tail -f /var/log/supervisor/backend.err.log

# Restart service
sudo supervisorctl restart backend
```

**Frontend build errors**
```bash
# Clear node_modules and reinstall
rm -rf node_modules yarn.lock
yarn install
```

**Database connection issues**
```bash
# Check MongoDB is running
sudo systemctl status mongod

# Verify connection string in backend/.env
```

## 📝 Development Notes

### Code Style
- Backend: Python with type hints, async/await patterns
- Frontend: Functional React components with hooks
- Consistent error handling with try/catch
- Toast notifications for user feedback

### Best Practices
- Always exclude MongoDB `_id` with `{"_id": 0}` projection
- Use environment variables for URLs and ports
- Apply privacy filters at API level
- Validate data with Pydantic models
- Use proper HTTP status codes (201 for creation, 401 for auth)

## 📄 License

Proprietary - All rights reserved

## 👥 Contributors

Built by Emergent Labs AI Agent (E1)

## 📞 Support

For issues or questions about TrustTrade, please contact support.

---

**Version**: 1.0.0  
**Last Updated**: February 24, 2026  
**Status**: Production Ready ✅
