export const getTtlUntilEndOfDay = (): number => {
    const now = new Date()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999) // Set to end of the day

    const ttlMs = endOfDay.getTime() - now.getTime()
    return Math.floor(ttlMs / 1000) // Convert milliseconds to seconds

}