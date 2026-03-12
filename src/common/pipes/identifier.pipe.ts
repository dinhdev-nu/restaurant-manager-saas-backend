import { isEmail, isPhoneNumber, registerDecorator, ValidationArguments, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";


@ValidatorConstraint({ name: 'IsEmailOrPhone', async: false })
export class IsEmailOrPhoneConstraint implements ValidatorConstraintInterface {
    validate(value: any, validationArguments?: ValidationArguments): Promise<boolean> | boolean {
        if (typeof value !== 'string')  return false
        return isEmail(value) || isPhoneNumber(value, 'VN');
    }
    defaultMessage(args?: ValidationArguments): string {
        return `$Indentifier must be a valid email or phone number`;
    }

}

export function IsEmailOrPhone(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsEmailOrPhoneConstraint,
        });
    };
}