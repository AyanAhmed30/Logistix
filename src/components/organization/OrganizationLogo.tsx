"use client";

import Image from "next/image";
import { LOGISTIX_LOGO_PATH } from "@/lib/logistix-logo";

type OrganizationLogoProps = {
  logoUrl?: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
};

export function OrganizationLogo({
  logoUrl,
  alt,
  width = 130,
  height = 40,
  className = "h-9 w-auto max-w-[130px] object-contain",
}: OrganizationLogoProps) {
  const src = logoUrl || LOGISTIX_LOGO_PATH;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized={Boolean(logoUrl)}
    />
  );
}
