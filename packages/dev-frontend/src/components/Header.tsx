import React from "react";
// import { FluidStoreState } from "@fluid/lib-base";
// import { useLiquitySelector } from "@fluid/lib-react";
import { Container, Flex } from "theme-ui";
// import { AddressZero } from "@ethersproject/constants";
// import { useFluid } from "../hooks/FluidContext";

import { FluidLogo } from "./FluidLogo";
// import { Nav } from "./Nav";
// import { SideNav } from "./SideNav";

const logoHeight = "28px";

// const select = ({ frontend }: FluidStoreState) => ({
//   frontend
// });

export const Header: React.FC = ({ children }) => {
  // const {
  //   config: { frontendTag }
  // } = useFluid();
  // const { frontend } = useLiquitySelector(select);
  // const isFrontendRegistered = frontendTag === AddressZero || frontend.status === "registered";

  return (
    <Container variant="header" paddingY={30}>
      <Flex sx={{ alignItems: "center", flex: 1 }}>
        <FluidLogo height={logoHeight} />

        {/* <Box
          sx={{
            mx: [2, 3],
            width: "0px",
            height: "100%",
            borderLeft: ["none", "1px solid lightgrey"]
          }}
        /> */}
        {/* {isFrontendRegistered && (
          <>
            <SideNav />
            <Nav />
          </>
        )} */}
      </Flex>

      {children}
    </Container>
  );
};
