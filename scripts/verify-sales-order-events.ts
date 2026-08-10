import { prisma } from "@/services/lib/prisma";

async function main() {
    console.log("Verifying Sales Order Events in Outbox...");

    const events = await prisma.integrationOutbox.findMany({
        where: {
            type: "SALES_ORDER_CREATED",
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 5,
    });

    if (events.length === 0) {
        console.log("No SALES_ORDER_CREATED events found.");
    } else {
        console.log(`Found ${events.length} recent event(s):`);
        events.forEach((event) => {
            console.log(`- ID: ${event.id}`);
            console.log(`  Aggregate ID (Order ID): ${event.aggregateId}`);
            console.log(`  Status: ${event.status}`);
            console.log(`  Payload:`, JSON.stringify(event.payload, null, 2));
            console.log("-----------------------------------");
        });
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
