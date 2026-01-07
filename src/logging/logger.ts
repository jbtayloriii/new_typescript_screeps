

export class Logger {
    private static readonly MAX_MESSAGE_COUNT = 200;

    // Screeps API limits emails to 1000 characters
    private static readonly MAX_EMAIL_LENGTH = 1000;

    private static instance: Logger | null = null;

    private constructor() { }

    public static report() {
        // Send logs when the day switches over
        let currentDate = new Date().getDate();
        if (Memory.log.lastReportedDate !== currentDate) {
            // Schedule 30 messages to send
            let emailCount = 30;
            while (emailCount > 0 && this.sendAndDumpLines()) {
                emailCount--;
            }
            Memory.log.lastReportedDate = currentDate;
        }
    }

    /**
     * Reads info logs to send an email notification and remove sent logs.
     * @returns True if an email is sent
     */
    private static sendAndDumpLines() {
        let contents: string[] = [];

        let header = "Logs at tick " + Game.time;
        let emailLength = header.length;

        contents[0] = header;
        for (let i = 0; i < Memory.log.infoMessages.length; i++) {
            let nextLine = Memory.log.infoMessages[i];

            // Check for +1 to append a newline
            if (nextLine.length + emailLength + 1 < Logger.MAX_EMAIL_LENGTH) {
                contents.push(nextLine);
                emailLength += nextLine.length + 1;
            } else {
                break;
            }
        }
        if (contents.length > 1) {
            Game.notify(contents.join("\n"));
            Memory.log.infoMessages.splice(0, contents.length - 1);
            return true;
        }

        return false;
    }

    public static info(message: string) {
        Memory.log.infoMessages.push(`${Game.time} - ${message}`);
        if (Memory.log.infoMessages.length > Logger.MAX_MESSAGE_COUNT) {
            Memory.log.infoMessages.splice(0, 1);
        }
        console.log("INFO:    " + message);
    }

    public static warning(message: string) {
        let formattedMessage = `${Game.time} - ${message}`;

        Memory.log.infoMessages.push(formattedMessage);
        if (Memory.log.infoMessages.length > Logger.MAX_MESSAGE_COUNT) {
            Memory.log.infoMessages.splice(0, 1);
        }

        Memory.log.warningMessages.push(formattedMessage);
        if (Memory.log.warningMessages.length > Logger.MAX_MESSAGE_COUNT) {
            Memory.log.warningMessages.splice(0, 1);
        }
        console.log("WARNING: " + message);
    }

    public static clearLogs() {
        Memory.log.infoMessages = [];
        Memory.log.warningMessages = [];
    }
}
