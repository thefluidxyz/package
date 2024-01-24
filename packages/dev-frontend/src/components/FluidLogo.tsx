import React from "react";
import { Box, Image, Flex } from "theme-ui";

type FluidLogoProps = React.ComponentProps<typeof Box> & {
  height?: number | string;
};

export const FluidLogo: React.FC<FluidLogoProps> = ({ height, ...boxProps }) => (
  <div sx={{ lineHeight: 0 }} {...boxProps}>
    <Flex sx={{ flexDirection: "row", minHeight: "100%", gap: 10, alignItems: 'center', fontSize: 35, fontWeight: 500, letterSpacing: -1 }}>
      <Image src="./fluid-logo.png" sx={{ height }} />
      Fluid
    </Flex>
  </div>
);
