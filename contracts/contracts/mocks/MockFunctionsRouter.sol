// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFunctionsConsumer {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

contract MockFunctionsRouter {
    uint256 private requestCounter;
    mapping(bytes32 => address) public requestConsumer;

    function sendRequest(
        uint64, /* subscriptionId */
        bytes calldata, /* data */
        uint16, /* dataVersion */
        uint32, /* callbackGasLimit */
        bytes32 /* donId */
    ) external returns (bytes32 requestId) {
        requestId = bytes32(++requestCounter);
        requestConsumer[requestId] = msg.sender;
    }

    function fulfillRequest(bytes32 requestId, bytes calldata response) external {
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "Unknown request");
        IFunctionsConsumer(consumer).handleOracleFulfillment(requestId, response, "");
    }

    function isValidCallbackGasLimit(uint64, uint32) external pure returns (bool) {
        return true;
    }
}
