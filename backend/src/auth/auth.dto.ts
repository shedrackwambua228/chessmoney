import { Transform } from 'class-transformer'
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string

  @IsString() @MinLength(10) @MaxLength(128)
  password!: string
}
export class RegisterDto extends LoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(32) @Matches(/^[\p{L}\p{N} _.-]+$/u)
  name!: string
}

export class VerifyEmailDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string

  @IsString() @Matches(/^\d{6}$/)
  code!: string
}

export class ResendVerificationDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string
}

export class ResetPasswordDto extends ResendVerificationDto {
  @IsString() @Matches(/^\d{6}$/)
  code!: string

  @IsString() @MinLength(10) @MaxLength(128)
  password!: string
}

