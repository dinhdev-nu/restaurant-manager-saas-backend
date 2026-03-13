export const TimeUtil = {

    getTtlUntilEndOfDay: (): number => {
        const now = new Date()
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999) // Set to end of the day

        const ttlMs = endOfDay.getTime() - now.getTime()
        return Math.floor(ttlMs / 1000) // Convert milliseconds to seconds
    },

    /**
     * // 1d, 1h, 30m, 45s
     * @param ttlString 
     * @returns 
     */
    parseTtlString: (ttlString: string): number => {
        const regex = /^(\d+)([smhd])$/; // Matches number followed by s, m, h, or d
        const match = ttlString.match(regex);
        if (!match) {
            throw new Error('Invalid TTL format. Use formats like "30s", "15m", "1h", or "2d".');
        }
        const [_, value, unit] = match;
        const num = parseInt(value);
        switch (unit) {
            case 's': return num;
            case 'm': return num * 60;
            case 'h': return num * 3600;
            case 'd': return num * 86400;
            default: throw new Error('Invalid TTL format. Use formats like "30s", "15m", "1h", or "2d".');
        }
    }

} as const