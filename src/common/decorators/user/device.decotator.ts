import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { DeviceInfo } from "src/modules/auth/dto/auth.dto";
import { UAParser } from "ua-parser-js";


export const UserDevice = createParamDecorator(
    (data, ctx: ExecutionContext): DeviceInfo => {
        const request = ctx.switchToHttp().getRequest();
        const userAgent = request.headers['user-agent'] || '';
        
        const parser = new UAParser(userAgent);
        const result = parser.getResult();

        return {
            browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
            
            os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
            
            device: result.device.model || result.device.type || 'Desktop',
            
            user_agent: userAgent,
        };
    }
)