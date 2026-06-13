import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateTenderDto {
  @IsString() @Length(1, 200) titleAr!: string;
  @IsString() @Length(1, 200) titleEn!: string;
  @IsString() @Length(1, 40) budgetCode!: string;
  @IsNumber() @Min(0) estimatedValueUSD!: number;

  @IsOptional() @IsBoolean() specializedOrEmergency?: boolean;
  @IsOptional() @IsBoolean() technicallyComplex?: boolean;
  @IsOptional() @IsBoolean() hasPreQualifiedList?: boolean;
  @IsOptional() @IsBoolean() hasRecentQualifiedBidders?: boolean;
  @IsOptional() @Matches(/^[a-g]$/) soleSourceCase?: string;

  /** override the engine suggestion — requires a justification */
  @IsOptional() @IsInt() @Min(1) methodIdOverride?: number;
  @IsOptional() @IsString() overrideJustification?: string;
}

export class SetPriceDto {
  @IsString() bidderId!: string;
  @IsNumber() @Min(0) priceUSD!: number;
}

export class CompleteStageDto {
  @IsString() stageKey!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) actualTo!: string;
}

export class ReturnDto {
  @IsString() @Length(1, 1000) notes!: string;
}
