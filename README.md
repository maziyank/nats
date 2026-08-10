# NATS — Enterprise Resource Planning System (v1.0.0-alpha)

NATS is a Next.js-based ERP system designed to handle various business functions ranging from accounting, inventory, sales, purchasing, POS, to payroll.

**[🌐 Lihat Dokumentasi Online](https://maziyank.github.io/nats/)**

## Key Features

- **Accounting**: Automated general ledger, journals, and financial reports.
- **Inventory**: Management of stock, warehouses, and item movements.
- **Sales & Purchasing**: Complete workflow from orders to invoices.
- **Point of Sale (POS)**: Responsive and user-friendly cashier interface.
- **Payroll**: Automated salary structure management and payslip generation.
- **AI Integration**: Smart features to assist in business data analysis.

## Screenshots

![1776302209274](doc/assets/images/dashboard.jpg)
_Main Dashboard View_

![1776302243874](doc/assets/images/accounting.jpg)
_Accounting Module_

![1776302322989](doc/assets/images/reports.jpg)
_Financial Report_

![1776302374473](doc/assets/images/pos.jpg)
_Point of Sale (POS)_

## Installation Guide

Follow the steps below to run NATS in your local environment.

### Prerequisites

Before starting, ensure your system has the following components:

- **Node.js**: Version 20.x or later.
- **NPM**: Usually included with the Node.js installation.
- **PostgreSQL**: The main system database.
- **Git**: For source code management.

### Installation Steps

#### 1. Clone Repository

```bash
git clone <repository-url>
cd nats
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Environment Variables

Copy the `.env.example` file to `.env` and adjust its values:

```bash
cp .env.example .env
```

Ensure the `DATABASE_URL` variable correctly points to your PostgreSQL instance:
`DATABASE_URL="postgresql://user:password@localhost:5432/nats"`

#### 4. Database Preparation

Create a database in PostgreSQL:

```bash
psql -U postgres -c "CREATE DATABASE nats;"
```

Perform database migration and schema creation:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

#### 5. Seed Initial Data

Populate the database with initial data (roles, default users, etc.). Choose one of the following options:

**Option A: Complete Seeding (Recommended for Testing)**
Includes sample products, transactions, and bulk data:

```bash
npm run prisma db seed
```

**Option B: Minimal Seeding (Clean Start)**
Includes only essential data: Company Profile, Chart of Accounts, and Default Roles/Users:

```bash
npm run prisma:seed:minimal
```

**Default Credentials:**

- **Password**: `password123` (for all default users)

| Role            | Email                    | Name            |
| :-------------- | :----------------------- | :-------------- |
| **Super Admin** | `admin@example.com`      | Admin User      |
| **Accountant**  | `accountant@example.com` | John Accountant |
| **Cashier**     | `cashier@example.com`    | Jane Cashier    |
| **Manager**     | `manager@example.com`    | Mike Manager    |
| **Merchant**    | `merchant@example.com`   | Sample Merchant |
| **Customer**    | `customer@example.com`   | Sample Customer |

#### 6. Run Application

Run the development server:

```bash
npm run dev
```

The application can be accessed at [http://localhost:3000](http://localhost:3000).

---

## Installation Using Docker (Optional)

If you want to run the application using Docker Compose:

```bash
docker-compose up -d
```

After the containers are running, initialize the database:

```bash
docker-compose exec app npx prisma migrate deploy
# Run complete seed
docker-compose exec app npm run prisma db seed

# OR run minimal seed
docker-compose exec app npm run prisma:seed:minimal
```

---

## License

This project is licensed under [LICENSE](LICENSE).
