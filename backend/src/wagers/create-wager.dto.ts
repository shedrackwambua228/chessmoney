import { IsIn, IsString, Matches, MinLength } from 'class-validator'

export class CreateWagerDto {
  @IsString()
  @MinLength(1)
  matchId!: string

  @IsIn(['Alex Mercer', 'Jordan D.'])
  selection!: string

  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string
}
