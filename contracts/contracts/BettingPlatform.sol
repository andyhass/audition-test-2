// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BettingPlatform is Ownable {
    using SafeERC20 for IERC20;

    enum EventStatus { OPEN, LOCKED, SETTLED, CANCELLED }
    enum BetSide { HOME, AWAY }

    struct SportEvent {
        uint256 id;
        string homeTeam;
        string awayTeam;
        uint256 homeOdds;
        uint256 awayOdds;
        uint256 startTime;
        EventStatus status;
        string externalId;
    }

    struct Bet {
        address bettor;
        BetSide side;
        uint256 amount;
        uint256 oddsSnapshot;
        bool settled;
    }

    IERC20 public immutable usdc;

    uint256 public nextEventId;
    mapping(uint256 => SportEvent) public events;
    mapping(uint256 => Bet[]) public eventBets;

    event EventCreated(uint256 indexed eventId, string homeTeam, string awayTeam);
    event OddsUpdated(uint256 indexed eventId, uint256 homeOdds, uint256 awayOdds);
    event BetPlaced(
        uint256 indexed eventId,
        address indexed bettor,
        BetSide side,
        uint256 amount,
        uint256 oddsSnapshot
    );
    event EventSettled(uint256 indexed eventId, uint8 result);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
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

    function settle(uint256 eventId, uint8 result) external onlyOwner {
        SportEvent storage evt = events[eventId];
        require(
            evt.status == EventStatus.OPEN || evt.status == EventStatus.LOCKED,
            "Already settled"
        );
        evt.status = EventStatus.SETTLED;
        Bet[] storage bets = eventBets[eventId];

        for (uint256 i = 0; i < bets.length; i++) {
            Bet storage bet = bets[i];
            if (bet.settled) continue;
            bet.settled = true;

            if (result == 2) {
                usdc.safeTransfer(bet.bettor, bet.amount);
            } else {
                bool won = (result == 0 && bet.side == BetSide.HOME) ||
                           (result == 1 && bet.side == BetSide.AWAY);
                if (won) {
                    uint256 payout = (bet.amount * bet.oddsSnapshot) / 10_000;
                    usdc.safeTransfer(bet.bettor, payout);
                }
            }
        }

        emit EventSettled(eventId, result);
    }

    function withdrawHouseFunds() external onlyOwner {
        usdc.safeTransfer(owner(), usdc.balanceOf(address(this)));
    }

    function getBets(uint256 eventId) external view returns (Bet[] memory) {
        return eventBets[eventId];
    }
}
