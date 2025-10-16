import { prisma } from "..";
import { HashPW } from "./authLoader";

export async function Init() {

    // Initialize database connections
    await prisma.$connect();

    console.log("Start Database checks: ")

    process.stdout.write("\n")

    process.stdout.write("Admin Present: ")
    if ((await prisma.user.count({
        where: {
            isAdmin: true
        }
    })) === 0) {
        const NewUser = await prisma.user.create({
            data: {
                username: "admin",
                password: HashPW(HashPW("admin")),
                isAdmin: true
            }
        })

        console.log("\n --- New Admin User Created ---")

        console.log(`Username: ${NewUser.username}`)
        console.log(`Password: admin`)

        console.log("--- New Admin User Created ---")
        console.log("These credentials will not be shown again.")
    } else {
        process.stdout.write("OK \n")
    }

    process.stdout.write("\n")
    console.log("Database checks complete.")
}