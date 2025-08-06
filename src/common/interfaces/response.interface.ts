export interface ResponseDTO {
    status: "success" | "error";
    code: number;
    message: string;
    metadata: any;
}