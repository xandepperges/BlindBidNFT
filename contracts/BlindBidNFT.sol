pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract BlindBidNFT is ZamaEthereumConfig {
    struct Bid {
        address bidder;
        euint32 encryptedBidAmount;
        uint256 deposit;
        bool isVerified;
        uint32 decryptedBidAmount;
    }

    struct Auction {
        string nftId;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        bool isSettled;
    }

    mapping(string => Auction) public auctions;
    mapping(string => Bid[]) public auctionBids;
    mapping(string => address) public auctionWinners;
    mapping(string => uint256) public auctionWinningBids;

    event AuctionCreated(string indexed nftId, uint256 startTime, uint256 endTime);
    event BidPlaced(string indexed nftId, address indexed bidder);
    event BidVerified(string indexed nftId, address indexed bidder, uint32 decryptedBidAmount);
    event AuctionSettled(string indexed nftId, address winner, uint32 winningBid);

    modifier onlyDuringAuction(string calldata nftId) {
        require(auctions[nftId].isActive, "Auction not active");
        require(block.timestamp >= auctions[nftId].startTime && block.timestamp <= auctions[nftId].endTime, "Outside auction time");
        _;
    }

    modifier onlyAfterAuction(string calldata nftId) {
        require(block.timestamp > auctions[nftId].endTime, "Auction still active");
        require(!auctions[nftId].isSettled, "Auction already settled");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function createAuction(
        string calldata nftId,
        uint256 startTime,
        uint256 endTime
    ) external {
        require(bytes(auctions[nftId].nftId).length == 0, "Auction already exists");
        require(startTime > block.timestamp, "Start time must be in future");
        require(endTime > startTime, "End time must be after start time");

        auctions[nftId] = Auction({
            nftId: nftId,
            startTime: startTime,
            endTime: endTime,
            isActive: true,
            isSettled: false
        });

        emit AuctionCreated(nftId, startTime, endTime);
    }

    function placeBid(
        string calldata nftId,
        externalEuint32 encryptedBidAmount,
        bytes calldata inputProof
    ) external payable onlyDuringAuction(nftId) {
        require(msg.value > 0, "Bid amount must be positive");
        require(FHE.isInitialized(FHE.fromExternal(encryptedBidAmount, inputProof)), "Invalid encrypted bid");

        Bid memory newBid = Bid({
            bidder: msg.sender,
            encryptedBidAmount: FHE.fromExternal(encryptedBidAmount, inputProof),
            deposit: msg.value,
            isVerified: false,
            decryptedBidAmount: 0
        });

        auctionBids[nftId].push(newBid);
        FHE.allowThis(newBid.encryptedBidAmount);
        FHE.makePubliclyDecryptable(newBid.encryptedBidAmount);

        emit BidPlaced(nftId, msg.sender);
    }

    function verifyBid(
        string calldata nftId,
        uint256 bidIndex,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        Bid storage bid = auctionBids[nftId][bidIndex];
        require(!bid.isVerified, "Bid already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(bid.encryptedBidAmount);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        require(decodedValue > 0, "Decrypted bid must be positive");

        bid.decryptedBidAmount = decodedValue;
        bid.isVerified = true;

        emit BidVerified(nftId, bid.bidder, decodedValue);
    }

    function settleAuction(string calldata nftId) external onlyAfterAuction(nftId) {
        Bid[] storage bids = auctionBids[nftId];
        require(bids.length > 0, "No bids to settle");

        uint32 highestBid = 0;
        address winner = address(0);
        uint256 winnerDeposit = 0;

        for (uint256 i = 0; i < bids.length; i++) {
            require(bids[i].isVerified, "All bids must be verified");
            if (bids[i].decryptedBidAmount > highestBid) {
                highestBid = bids[i].decryptedBidAmount;
                winner = bids[i].bidder;
                winnerDeposit = bids[i].deposit;
            }
        }

        require(winner != address(0), "No valid winner found");

        auctionWinners[nftId] = winner;
        auctionWinningBids[nftId] = highestBid;
        auctions[nftId].isSettled = true;

        payable(winner).transfer(winnerDeposit);

        emit AuctionSettled(nftId, winner, highestBid);
    }

    function getAuction(string calldata nftId) external view returns (
        string memory,
        uint256,
        uint256,
        bool,
        bool
    ) {
        Auction storage auction = auctions[nftId];
        return (
            auction.nftId,
            auction.startTime,
            auction.endTime,
            auction.isActive,
            auction.isSettled
        );
    }

    function getBid(string calldata nftId, uint256 bidIndex) external view returns (
        address,
        uint256,
        bool,
        uint32
    ) {
        Bid storage bid = auctionBids[nftId][bidIndex];
        return (
            bid.bidder,
            bid.deposit,
            bid.isVerified,
            bid.decryptedBidAmount
        );
    }

    function getAuctionBidsLength(string calldata nftId) external view returns (uint256) {
        return auctionBids[nftId].length;
    }

    function getAuctionWinner(string calldata nftId) external view returns (address, uint32) {
        require(auctions[nftId].isSettled, "Auction not settled");
        return (auctionWinners[nftId], auctionWinningBids[nftId]);
    }
}

