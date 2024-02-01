// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/ISAIToken.sol";

contract SAITokenCaller {
    ISAIToken SAI;

    function setSAI(ISAIToken _SAI) external {
        SAI = _SAI;
    }

    function saiMint(address _account, uint _amount) external {
        SAI.mint(_account, _amount);
    }

    function saiBurn(address _account, uint _amount) external {
        SAI.burn(_account, _amount);
    }

    function saiSendToPool(address _sender,  address _poolAddress, uint256 _amount) external {
        SAI.sendToPool(_sender, _poolAddress, _amount);
    }

    function saiReturnFromPool(address _poolAddress, address _receiver, uint256 _amount ) external {
        SAI.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
