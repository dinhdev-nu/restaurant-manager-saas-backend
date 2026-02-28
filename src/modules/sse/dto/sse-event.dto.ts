export interface SseEvent {
    restaurantId?: string
    userId: string;
    data: any;
    type: string
}