-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "passengers" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingLeg" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ticketCode" TEXT,
    "seat" TEXT,
    "serviceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "departAt" TIMESTAMP(3) NOT NULL,
    "arriveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatHold" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "seat" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelayHistory" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelayHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLeg_ticketCode_key" ON "BookingLeg"("ticketCode");

-- CreateIndex
CREATE INDEX "SeatHold_expiresAt_idx" ON "SeatHold"("expiresAt");

-- CreateIndex
CREATE INDEX "DelayHistory_provider_routeKey_idx" ON "DelayHistory"("provider", "routeKey");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLeg" ADD CONSTRAINT "BookingLeg_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_legId_fkey" FOREIGN KEY ("legId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

