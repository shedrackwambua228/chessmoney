import { Matches } from 'class-validator'

export class MoneyDto {
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string
}
