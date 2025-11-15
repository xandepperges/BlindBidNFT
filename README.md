# BlindBidNFT: A Privacy-Preserving NFT Bidding Platform

BlindBidNFT is a cutting-edge platform for blind bidding on NFTs that leverages Zama's Fully Homomorphic Encryption (FHE) technology. By concealing bidders' offers until the auction concludes, our platform effectively prevents bid sniping and price manipulation, ensuring a fair and secure environment for all participants.

## The Problem

In the world of NFTs, transparency can sometimes lead to undesirable behaviors such as bid sniping—where a bidder places a last-second offer to win the auction at the lowest possible price. These tactics can undermine the integrity of the auction process and make it difficult for genuine bidders to participate with confidence.

Moreover, revealing bid amounts can compromise the privacy of collectors, exposing them to market manipulation and leading to unwanted pressure during the bidding process. The need for a solution that not only secures bids but also protects the identities and intentions of participants is crucial.

## The Zama FHE Solution

Fully Homomorphic Encryption (FHE) enables computation on encrypted data, allowing us to process bids without exposing the underlying information. By using Zama's advanced encryption technologies, we create a secure environment where bids can be submitted, computed, and evaluated while remaining confidential.

Leveraging fhevm, we encapsulate bidders' offers in encrypted form, making it impossible for any unauthorized parties to decipher the bids while still allowing the auction mechanism to function seamlessly. This innovative approach not only enhances security but also fosters trust among users by prioritizing their privacy.

## Key Features

- 🔒 **Bid Encryption**: All bids are securely encrypted, ensuring that no one can see them until the auction ends.
- 🛑 **Automatic Settlement**: The auction automatically settles once it concludes, minimizing the need for manual intervention.
- 📊 **Vickrey Auction Support**: Our platform supports Vickrey auctions, where the highest bidder wins but pays the amount of the second-highest bid, promoting honest bidding behavior.
- 🎨 **High-End Art Focus**: Designed for collectors and galleries, BlindBidNFT caters to the high-end art market, allowing users to bid on exclusive digital artworks.
- 🤝 **Privacy Protection**: We prioritize user anonymity, ensuring that the identities of bidders remain confidential throughout the auction process.

## Technical Architecture & Stack

BlindBidNFT is built on a robust tech stack that includes:

- **Frontend**: Designed for user-friendly interactions, managing bid submissions and auction displays.
- **Backend**: Handles the logic and processing of bids securely using Zama's FHE technology.
- **Blockchain**: Integrated to ensure transparency and immutability of auction results.

### Key Components:
- **Zama**: The core privacy engine that powers bid encryption and secure computations.
- **fhevm**: Utilized for processing encrypted inputs and managing bid validation.

## Smart Contract / Core Logic

Below is a simplified version of the Solidity smart contract snippet that demonstrates how we will handle bids securely using Zama's technologies.

```solidity
// BlindBidNFT.sol
pragma solidity ^0.8.0;

import "zama-fhevm.sol";

contract BlindBidNFT {
    struct Bid {
        address bidder;
        uint64 encryptedBid; // Store the encrypted bid amount
    }

    // Function to place a bid
    function placeBid(uint64 _encryptedBid) public {
        Bid memory newBid = Bid(msg.sender, _encryptedBid);
        // Logic to handle the processing of the encrypted bid
        TFHE.add(newBid.encryptedBid); // Adding the encrypted bid
    }

    function settleAuction() public {
        // Logic for settling auction and revealing highest bid
        uint64 winnerBid = TFHE.decrypt(/*...*/);
        // Handle winner payment and NFT transfer
    }
}
```

## Directory Structure

Here's the proposed directory structure for the BlindBidNFT project:

```
BlindBidNFT/
├── contracts/
│   └── BlindBidNFT.sol
├── scripts/
│   └── auction.js
├── src/
│   ├── App.js
│   └── BidForm.js
├── tests/
│   └── BlindBidNFT.test.js
├── package.json
└── README.md
```

## Installation & Setup

To get started with BlindBidNFT, you must ensure you have the necessary tools and dependencies installed.

### Prerequisites

- Node.js (version 14.x or higher)
- npm (Node package manager)
- Truffle or Hardhat for smart contract management

### Installation Steps

1. Install project dependencies:
   ```bash
   npm install
   ```

2. Install Zama's FHE library:
   ```bash
   npm install fhevm
   ```

3. Install any other required libraries as specified in the package.json.

## Build & Run

To compile and run the BlindBidNFT project, use the following commands:

1. Compile the smart contracts:
   ```bash
   npx hardhat compile
   ```

2. Start the local development server:
   ```bash
   npm start
   ```

3. Deploy the smart contracts to your preferred test network:
   ```bash
   npx hardhat run scripts/deploy.js --network yourNetwork
   ```

4. Execute your tests:
   ```bash
   npx hardhat test
   ```

## Acknowledgements

We would like to extend our heartfelt thanks to Zama for providing the open-source FHE primitives that make this project possible. Their dedication to advancing the field of encryption allows us to build innovative and secure applications like BlindBidNFT.

