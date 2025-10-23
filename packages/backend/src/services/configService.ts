import { psql } from ".."

export class ConfigManager {
    constructor() {
        process.stdout.write("ConfigManager: ");

        this.init();

        process.stdout.write("OK \n");
    }

    public async init() {
        const { unsubscribe } = await psql.subscribe(
            '*:config',
            (row, { command, relation }) => {
                // Callback function for each row change
                // tell about new event row over eg. websockets or do something else

                console.log({ row, command, relation });


            },
            () => {
                // Callback on initial connect and potential reconnects
            }
        )
    }
}