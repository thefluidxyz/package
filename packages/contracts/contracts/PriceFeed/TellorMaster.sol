// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

/**
 @author Tellor Inc.
 @title TellorProxy
* @dev The Transition contract links to the Oracle contract and
* allows parties (like fluid) to continue to use the master
* address to access values which use legacy query IDs (request IDs). 
*/
contract TellorMaster {

    /**
     * @dev Counts the number of values that have been submitted for the requestId.
     * @param _requestId the requestId to look up
     * @return uint256 count of the number of values received for the requestId
     */
    function getNewValueCountbyRequestId(uint256 _requestId)
        public
        view
        returns (uint256)
    {
        return 1827;
    }


    /**
     * @dev Gets the timestamp for the value based on its index
     * @param _requestId is the requestId to look up
     * @param _index is the value index to look up
     * @return uint256 timestamp
     */
    function getTimestampbyRequestIDandIndex(uint256 _requestId, uint256 _index)
        public
        view
        returns (uint256)
    {
        return block.timestamp;
    }

    /**
     * @dev Retrieve value from oracle based on timestamp
     * @param _requestId being requested
     * @param _timestamp to retrieve data/value from
     * @return uint256 value for timestamp submitted
     */
    function retrieveData(uint256 _requestId, uint256 _timestamp)
        public
        view
        returns (uint256)
    {
        return 2595750000;
    }
}