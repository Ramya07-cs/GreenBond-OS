// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GreenBond
 * @notice Immutable on-chain audit trail for Green Bond performance events.
 *
 * Every penalty rate hike and recovery rate reset is recorded here.
 * This contract is the "single source of truth" for interest rate changes —
 * no human can alter or delete these records after they are written.
 *
 * * Deployed on Polygon Amoy Testnet for development and testing.
 */
contract GreenBond {

    address public owner;

    struct RateChange {
        uint256 timestamp;
        string  bondId;
        uint256 previousRate;    // basis points: 500 = 5.00%
        uint256 newRate;         // basis points
        string  triggerType;     // "PENALTY_TRIGGER" | "RECOVERY_TRIGGER"
        bytes32 dataHash;        // keccak256 of the PR data JSON payload
        uint256 blockNumber;
    }

    // bondId => list of rate changes (append-only)
    mapping(string => RateChange[]) private rateHistory;

    // bondId => current rate (basis points)
    mapping(string => uint256) public currentRate;

    // All bond IDs ever recorded
    string[] public allBondIds;
    mapping(string => bool) private bondExists;

    // ── Events ────────────────────────────────────────────────────────────────

    event RateChanged(
        string indexed bondId,
        uint256 previousRate,
        uint256 newRate,
        string  triggerType,
        bytes32 dataHash,
        uint256 timestamp
    );

    event BondRegistered(string bondId, uint256 baseRate, uint256 timestamp);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "GreenBond: caller is not the owner");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ── Write Functions ───────────────────────────────────────────────────────

    /**
     * @notice Register a new bond with its base rate.
     * @param bondId   Unique bond identifier 
     * @param baseRate Base interest rate in basis points (500 = 5.00%) => Basis point encoding
        //Solidity doesn't have float/decimal numbers so for precision we multiply 100
     */
    function registerBond(string calldata bondId, uint256 baseRate) external onlyOwner {
        require(!bondExists[bondId], "GreenBond: bond already registered");
        require(baseRate > 0 && baseRate <= 5000, "GreenBond: invalid base rate");   //no green bond issuer would ever reach this,max penalty rate is 50%

        bondExists[bondId] = true;
        currentRate[bondId] = baseRate;
        allBondIds.push(bondId);

        emit BondRegistered(bondId, baseRate, block.timestamp);
    }

    /**
     * @notice Record a rate change event (penalty or recovery).
     * @param bondId      Bond identifier
     * @param newRate     New interest rate in basis points
     * @param triggerType "PENALTY_TRIGGER" or "RECOVERY_TRIGGER"
     * @param dataHash    keccak256 hash of the PR calculation data JSON
     */
    function recordRateChange(
        string calldata bondId,
        uint256 newRate,
        string calldata triggerType,
        bytes32 dataHash
    ) external onlyOwner {
        require(bondExists[bondId], "GreenBond: bond not registered");
        require(newRate > 0 && newRate <= 5000, "GreenBond: invalid rate");

        uint256 prevRate = currentRate[bondId];

        RateChange memory change = RateChange({
            timestamp:   block.timestamp,
            bondId:      bondId,
            previousRate: prevRate,
            newRate:     newRate,
            triggerType: triggerType,
            dataHash:    dataHash,
            blockNumber: block.number
        });

        rateHistory[bondId].push(change);
        currentRate[bondId] = newRate;

        emit RateChanged(bondId, prevRate, newRate, triggerType, dataHash, block.timestamp);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /**
     * @notice Get all rate change events for a bond.
     */
    function getRateHistory(string calldata bondId)
        external view returns (RateChange[] memory)
    {
        return rateHistory[bondId];
    }

    /**
     * @notice Get the number of rate changes recorded for a bond.
     */
    function getRateChangeCount(string calldata bondId)
        external view returns (uint256)
    {
        return rateHistory[bondId].length;
    }

    /**
     * @notice Get current rate for a bond (in basis points).
     */
    function getCurrentRate(string calldata bondId)
        external view returns (uint256)
    {
        return currentRate[bondId];
    }

    /**
     * @notice Get total number of registered bonds.
     */
    function getBondCount() external view returns (uint256) {
        return allBondIds.length;
    }

    /**
     * @notice Transfer ownership of the contract.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "GreenBond: zero address");
        owner = newOwner;
    }
}