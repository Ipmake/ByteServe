import { prisma, psql } from ".."

export class ConfigManager {
    public static Config: Record<string, string> = {};

    constructor() {
        process.stdout.write("ConfigManager: ");

        this.init();

        process.stdout.write("OK \n");
    }

    public async init() {
        await ConfigManager.loadConfigCache();
        const { unsubscribe } = await psql.subscribe(
            '*:Config',
            async (row, { command, relation }) => {
                // Callback function for each row change
                // tell about new event row over eg. websockets or do something else
                console.log("Config altered, reloading cache...")

                await ConfigManager.loadConfigCache();

                console.log("Config cache reloaded.")
            },
            () => {
                // Callback on initial connect and potential reconnects
            }
        )
    }

    public static async loadConfigCache() {
        const configs = await prisma.config.findMany();
        ConfigManager.Config = {};
        configs.forEach((config) => {
            ConfigManager.Config[config.key] = config.value;
        });
    }
}