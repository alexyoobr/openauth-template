-- Migration number: 0002 	 2025-10-21T00:00:00.000Z
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    companyId TEXT NOT NULL,
    produced REAL NOT NULL,
    storeId INTEGER NOT NULL,
    orderId INTEGER NOT NULL,
    skuId TEXT NOT NULL,
    productId TEXT,
    category TEXT,
    model TEXT,
    cost REAL,
    subcategory TEXT,
    brand TEXT,
    collection TEXT,
    quantity REAL,
    salePrice REAL,
    discount REAL,
    total REAL,
    description TEXT,
    color TEXT,
    size TEXT,
    transactionCode TEXT,
    customerName TEXT,
    payment TEXT,
    saleDatetime TEXT,
    sellerName TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_key
ON orders (companyId, storeId, orderId, skuId);