// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BettingPlatform is FunctionsClient, Ownable {
    using FunctionsRequest for FunctionsRequest.Request;
    using SafeERC20 for IERC20;

    enum EventStatus { OPEN, LOCKED, SETTLED, CANCELLED }
    enum BetSide { HOME, AWAY }

    struct SportEvent {
        uint256 id;
        string homeTeam;
        string awayTeam;
        uint256 homeOdds;   // basis points: 18000 = 1.80x
        uint256 awayOdds;
        uint256 startTime;
        EventStatus status;
        string externalId;  // TheSportsDB event ID
    }

    struct Bet {
        address bettor;
        BetSide side;
        uint256 amount;         // USDC in 6-decimal units
        uint256 oddsSnapshot;   // basis points, locked at bet time
        bool settled;
    }

    IERC20 public immutable usdc;
    uint64 public subscriptionId;
    uint32 public constant GAS_LIMIT = 300_000;
    bytes32 public constant DON_ID =
        0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000;

    string public functionsSource;

    uint256 public nextEventId;
    mapping(uint256 => SportEvent) public events;
    mapping(uint256 => Bet[]) public eventBets;
    mapping(bytes32 => uint256) public requestToEvent;

    event EventCreated(uint256 indexed eventId, string homeTeam, string awayTeam);
    event OddsUpdated(uint256 indexed eventId, uint256 homeOdds, uint256 awayOdds);
    event BetPlaced(
        uint256 indexed eventId,
        address indexed bettor,
        BetSide side,
        uint256 amount,
        uint256 oddsSnapshot
    );
    event SettlementRequested(uint256 indexed eventId, bytes32 requestId);
    event EventSettled(uint256 indexed eventId, uint8 result);

    constructor(
        address router,
        address _usdc,
        uint64 _subscriptionId,
        string memory _functionsSource
    ) FunctionsClient(router) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        subscriptionId = _subscriptionId;
        functionsSource = _functionsSource;
    }

    function depositLiquidity(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function createEvent(
        string calldata homeTeam,
        string calldata awayTeam,
        uint256 homeOdds,
        uint256 awayOdds,
        uint256 startTime,
        string calldata externalId
    ) external onlyOwner returns (uint256 eventId) {
        eventId = nextEventId++;
        events[eventId] = SportEvent({
            id: eventId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            homeOdds: homeOdds,
            awayOdds: awayOdds,
            startTime: startTime,
            status: EventStatus.OPEN,
            externalId: externalId
        });
        emit EventCreated(eventId, homeTeam, awayTeam);
    }

    function updateOdds(
        uint256 eventId,
        uint256 homeOdds,
        uint256 awayOdds
    ) external onlyOwner {
        SportEvent storage evt = events[eventId];
        require(evt.status == EventStatus.OPEN, "Not open");
        require(block.timestamp < evt.startTime, "Match started");
        evt.homeOdds = homeOdds;
        evt.awayOdds = awayOdds;
        emit OddsUpdated(eventId, homeOdds, awayOdds);
    }

    function withdrawHouseFunds() external onlyOwner {
        usdc.safeTransfer(owner(), usdc.balanceOf(address(this)));
    }

    function placeBet(uint256 eventId, BetSide side, uint256 amount) external {
        SportEvent storage evt = events[eventId];
        require(evt.status == EventStatus.OPEN, "Betting not open");
        require(block.timestamp < evt.startTime, "Match already started");
        require(amount > 0, "Amount must be positive");

        uint256 odds = side == BetSide.HOME ? evt.homeOdds : evt.awayOdds;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        eventBets[eventId].push(Bet({
            bettor: msg.sender,
            side: side,
            amount: amount,
            oddsSnapshot: odds,
            settled: false
        }));

        emit BetPlaced(eventId, msg.sender, side, amount, odds);
    }

    function getBets(uint256 eventId) external view returns (Bet[] memory) {
        return eventBets[eventId];
    }

    function fulfillRequest(
        bytes32, /* requestId */
        bytes memory, /* response */
        bytes memory /* err */
    ) internal override {}
}
