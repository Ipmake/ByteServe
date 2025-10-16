import { PGlite } from "@electric-sql/pglite";
import { defineConfig } from "prisma/config";
import { PrismaPGlite } from "pglite-prisma-adapter";

export default defineConfig({
    experimental: {
        adapter: true,
        studio: true,
    },
    schema: "./prisma/schema.prisma",
    studio: {
        async adapter() {
            const client = new PGlite("./data");
            return new PrismaPGlite(client) as any;
        },
    },
    adapter: async () => {
        const client = new PGlite("./data");
        return new PrismaPGlite(client) as any;
    },
});