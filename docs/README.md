# 🛍️ Myntra Clone — Full Stack E-commerce Web App

This is a full-featured eCommerce application inspired by [Myntra](https://www.myntra.com), built using modern, secure, and scalable technologies. The goal is to deliver an intuitive shopping experience with a clean UI, robust backend, and integrated payments.

---

## 🚀 Tech Stack

| Layer        | Tech                                  |
|--------------|----------------------------------------|
| Frontend     | Next.js + TypeScript + TailwindCSS     |
| Backend      | NestJS + TypeScript + Prisma ORM       |
| Database     | PostgreSQL (via Prisma)                |
| Auth         | NextAuth.js (Frontend), JWT (Backend)  |
| Payments     | Stripe or Razorpay                     |
| Storage      | Cloudinary or Firebase (optional)      |
| CI/CD        | GitLab CI/CD                           |
| Deployment   | Vercel (frontend), Railway/Render (backend & DB) |
| Testing      | Jest, React Testing Library, Cypress   |

---

## 📁 Folder Structure
myntra-clone/ 
├── frontend/ 
# Next.js frontend 
├── backend/ 
# NestJS backend 
├── prisma/ 
# Prisma schema and migrations 
├── docs/ # Project documentation 
├── .gitlab-ci.yml 
# GitLab CI/CD pipeline config 
└── README.md

---

# Documentation

## API Endpoints and Schema

### Backend API Endpoints

#### Authentication
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Login and receive access and refresh tokens.
- `POST /auth/refresh`: Refresh access token using refresh token.

#### Products
- `GET /products`: Get all products with optional filters (e.g., category, price range).
- `GET /products/:id`: Get details of a single product.
- `POST /products`: Add a new product (Admin only).
- `PUT /products/:id`: Update a product (Admin only).
- `DELETE /products/:id`: Delete a product (Admin only).

#### Cart
- `POST /cart/add`: Add an item to the cart.
- `DELETE /cart/remove/:id`: Remove an item from the cart.
- `PUT /cart/update/:id`: Update the quantity of an item in the cart.

#### Orders
- `POST /orders`: Place an order.
- `GET /orders`: Get all orders for the logged-in user.
- `POST /orders/create-payment-intent`: Create a payment intent for Stripe.
- `POST /orders/webhook`: Handle Stripe webhooks for payment success/failure.

### Database Schema
- **User**: `id`, `email`, `password`, `role`, `orders`
- **Product**: `id`, `name`, `price`, `category`, `description`, `imageUrl`, `inStock`
- **Order**: `id`, `userId`, `products (JSON)`, `total`, `status`

## Tech Stack Used

### Frontend
- **Framework**: Next.js
- **Styling**: TailwindCSS
- **State Management**: React Context
- **Testing**: Jest, React Testing Library, Cypress

### Backend
- **Framework**: NestJS
- **Database**: PostgreSQL (via Prisma ORM)
- **Authentication**: JWT (Access & Refresh Tokens)
- **Payments**: Stripe
- **Testing**: Jest

## Folder Structure

```
backend/
  src/
    auth/          # Authentication logic
    products/      # Product-related logic
    cart/          # Cart-related logic
    orders/        # Order-related logic
frontend/
  src/
    app/           # React components and pages
    api/           # Axios instance for API calls
prisma/
  schema.prisma    # Database schema
  migrations/      # Database migrations
```

## How to Run Locally

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd myFirstEcommWebsite
   ```

2. Set up environment variables:
   - Create `.env` files in `frontend/` and `backend/`.
   - Add variables like `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_BACKEND_URL`, etc.

3. Install dependencies:
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```

4. Run the database migrations:
   ```bash
   cd prisma && npx prisma migrate dev
   ```

5. Start the development servers:
   ```bash
   cd frontend && npm run dev
   cd ../backend && npm run start:dev
   ```

6. Open the frontend at [http://localhost:3000](http://localhost:3000).

## How to Deploy

### Frontend
- Deploy to Vercel.
- Set `NEXT_PUBLIC_BACKEND_URL` in Vercel environment variables.

### Backend
- Deploy to Render or Railway.
- Set environment variables like `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, etc.

### Database
- Use Railway to provision a PostgreSQL database.

## How to Contribute

1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes and commit them:
   ```bash
   git commit -m "Add your message here"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a pull request.

We welcome contributions from the community!

//Deploy script
name: Myntra Clone CI/CD Pipeline

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies for frontend
        run: |
          cd frontend
          npm install

      - name: Install dependencies for backend
        run: |
          cd backend
          npm install

      - name: Install dependencies for Prisma
        run: |
          cd prisma
          npm install

  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run frontend tests
        run: |
          cd frontend
          npm test

      - name: Run backend tests
        run: |
          cd backend
          npm test

  deploy:
    runs-on: ubuntu-latest
    needs: [setup, test]
    steps:
      - name: Deploy frontend to Vercel
        run: |
          cd frontend
          npm run build
          # Add Vercel deployment commands here

      - name: Deploy backend to Render
        run: |
          cd backend
          npm run build
          # Add Render deployment commands here
