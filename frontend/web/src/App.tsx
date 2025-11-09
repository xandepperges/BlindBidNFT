import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface NFTBid {
  id: string;
  name: string;
  encryptedBid: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface BidStats {
  totalBids: number;
  activeAuctions: number;
  totalVolume: number;
  verifiedBids: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<NFTBid[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [placingBid, setPlacingBid] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newBidData, setNewBidData] = useState({ nftName: "", bidAmount: "", description: "" });
  const [selectedBid, setSelectedBid] = useState<NFTBid | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);
  const [userHistory, setUserHistory] = useState<NFTBid[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadBids();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadBids = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const bidsList: NFTBid[] = [];
      const userBids: NFTBid[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const bid: NFTBid = {
            id: businessId,
            name: businessData.name,
            encryptedBid: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          };
          
          bidsList.push(bid);
          if (bid.creator.toLowerCase() === address?.toLowerCase()) {
            userBids.push(bid);
          }
        } catch (e) {
          console.error('Error loading bid data:', e);
        }
      }
      
      setBids(bidsList);
      setUserHistory(userBids);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load bids" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const placeBid = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setPlacingBid(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Placing encrypted bid with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const bidAmount = parseInt(newBidData.bidAmount) || 0;
      const businessId = `nft-bid-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, bidAmount);
      
      const tx = await contract.createBusinessData(
        businessId,
        newBidData.nftName,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidAmount,
        0,
        newBidData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted bid placed successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadBids();
      setShowBidModal(false);
      setNewBidData({ nftName: "", bidAmount: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Bid failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setPlacingBid(false); 
    }
  };

  const decryptBid = async (bidId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const bidData = await contractRead.getBusinessData(bidId);
      if (bidData.isVerified) {
        const storedValue = Number(bidData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(bidId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(bidId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadBids();
      setTransactionStatus({ visible: true, status: "success", message: "Bid decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadBids();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Contract is available: ${isAvailable}` 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const getBidStats = (): BidStats => {
    const totalBids = bids.length;
    const verifiedBids = bids.filter(b => b.isVerified).length;
    const totalVolume = bids.reduce((sum, bid) => sum + (bid.isVerified ? (bid.decryptedValue || 0) : bid.publicValue1), 0);
    const activeAuctions = bids.filter(bid => Date.now()/1000 - bid.timestamp < 60 * 60 * 24).length;

    return { totalBids, activeAuctions, totalVolume, verifiedBids };
  };

  const filteredBids = bids.filter(bid => {
    const matchesSearch = bid.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         bid.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterVerified || bid.isVerified;
    return matchesSearch && matchesFilter;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>BlindBidNFT 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔒</div>
            <h2>Connect to Private NFT Bidding</h2>
            <p>Secure your bids with FHE encryption. Connect your wallet to start private NFT bidding.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Place encrypted bids that remain private</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Reveal bids only after auction ends</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p className="loading-note">Setting up private bidding environment</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted bids...</p>
    </div>
  );

  const stats = getBidStats();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>BlindBidNFT 🔐</h1>
          <span className="tagline">FHE-Protected NFT Bidding</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check Status
          </button>
          <button onClick={() => setShowBidModal(true)} className="create-btn">
            + Place Bid
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-grid">
          <div className="stat-card neon-purple">
            <h3>Total Bids</h3>
            <div className="stat-value">{stats.totalBids}</div>
          </div>
          <div className="stat-card neon-blue">
            <h3>Active Auctions</h3>
            <div className="stat-value">{stats.activeAuctions}</div>
          </div>
          <div className="stat-card neon-pink">
            <h3>Total Volume</h3>
            <div className="stat-value">{stats.totalVolume} ETH</div>
          </div>
          <div className="stat-card neon-green">
            <h3>Verified</h3>
            <div className="stat-value">{stats.verifiedBids}</div>
          </div>
        </div>

        <div className="controls-section">
          <div className="search-filter">
            <input 
              type="text" 
              placeholder="Search bids..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <label className="filter-toggle">
              <input 
                type="checkbox" 
                checked={filterVerified}
                onChange={(e) => setFilterVerified(e.target.checked)}
              />
              Show Verified Only
            </label>
          </div>
          <button onClick={loadBids} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="bids-section">
          <h2>Encrypted NFT Bids</h2>
          <div className="bids-grid">
            {filteredBids.length === 0 ? (
              <div className="no-bids">
                <p>No encrypted bids found</p>
                <button onClick={() => setShowBidModal(true)} className="create-btn">
                  Place First Bid
                </button>
              </div>
            ) : filteredBids.map((bid) => (
              <div 
                key={bid.id} 
                className={`bid-card ${selectedBid?.id === bid.id ? "selected" : ""} ${bid.isVerified ? "verified" : ""}`}
                onClick={() => setSelectedBid(bid)}
              >
                <div className="bid-header">
                  <h3>{bid.name}</h3>
                  <span className={`status ${bid.isVerified ? "verified" : "encrypted"}`}>
                    {bid.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </span>
                </div>
                <p className="bid-description">{bid.description}</p>
                <div className="bid-meta">
                  <span>Bidder: {bid.creator.substring(0, 6)}...{bid.creator.substring(38)}</span>
                  <span>Time: {new Date(bid.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                {bid.isVerified && (
                  <div className="revealed-bid">
                    Final Bid: {bid.decryptedValue} ETH
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {userHistory.length > 0 && (
          <div className="user-history">
            <h2>Your Bidding History</h2>
            <div className="history-list">
              {userHistory.map((bid) => (
                <div key={bid.id} className="history-item">
                  <span>{bid.name}</span>
                  <span>{bid.isVerified ? `Revealed: ${bid.decryptedValue} ETH` : "Encrypted"}</span>
                  <span>{new Date(bid.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showBidModal && (
        <BidModal 
          onSubmit={placeBid} 
          onClose={() => setShowBidModal(false)} 
          placing={placingBid} 
          bidData={newBidData} 
          setBidData={setNewBidData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedBid && (
        <BidDetailModal 
          bid={selectedBid} 
          onClose={() => { 
            setSelectedBid(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptBid={() => decryptBid(selectedBid.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const BidModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  placing: boolean;
  bidData: any;
  setBidData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, placing, bidData, setBidData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'bidAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setBidData({ ...bidData, [name]: intValue });
    } else {
      setBidData({ ...bidData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bid-modal">
        <div className="modal-header">
          <h2>Place Encrypted Bid</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice neon-glow">
            <strong>FHE 🔐 Blind Bidding</strong>
            <p>Your bid amount will be encrypted and remain private until auction ends</p>
          </div>
          
          <div className="form-group">
            <label>NFT Name *</label>
            <input 
              type="text" 
              name="nftName" 
              value={bidData.nftName} 
              onChange={handleChange} 
              placeholder="Enter NFT name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Bid Amount (ETH) *</label>
            <input 
              type="number" 
              name="bidAmount" 
              value={bidData.bidAmount} 
              onChange={handleChange} 
              placeholder="Enter bid amount..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={bidData.description} 
              onChange={handleChange} 
              placeholder="Bid description..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={placing || isEncrypting || !bidData.nftName || !bidData.bidAmount} 
            className="submit-btn neon-btn"
          >
            {placing || isEncrypting ? "Encrypting Bid..." : "Place Encrypted Bid"}
          </button>
        </div>
      </div>
    </div>
  );
};

const BidDetailModal: React.FC<{
  bid: any;
  onClose: () => void;
  decryptedAmount: number | null;
  isDecrypting: boolean;
  decryptBid: () => Promise<number | null>;
}> = ({ bid, onClose, decryptedAmount, isDecrypting, decryptBid }) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) return;
    await decryptBid();
  };

  return (
    <div className="modal-overlay">
      <div className="bid-detail-modal">
        <div className="modal-header">
          <h2>Bid Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="bid-info">
            <div className="info-item">
              <span>NFT:</span>
              <strong>{bid.name}</strong>
            </div>
            <div className="info-item">
              <span>Bidder:</span>
              <strong>{bid.creator.substring(0, 6)}...{bid.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Time:</span>
              <strong>{new Date(bid.timestamp * 1000).toLocaleString()}</strong>
            </div>
          </div>
          
          <div className="bid-amount-section">
            <h3>Bid Amount</h3>
            <div className="amount-display">
              {bid.isVerified ? (
                <div className="revealed-amount">
                  <span className="amount-label">Final Bid:</span>
                  <span className="amount-value">{bid.decryptedValue} ETH</span>
                  <span className="status-badge verified">✅ On-chain Verified</span>
                </div>
              ) : decryptedAmount !== null ? (
                <div className="revealed-amount">
                  <span className="amount-label">Decrypted Bid:</span>
                  <span className="amount-value">{decryptedAmount} ETH</span>
                  <span className="status-badge local">🔓 Locally Decrypted</span>
                </div>
              ) : (
                <div className="encrypted-amount">
                  <span className="amount-label">Current Status:</span>
                  <span className="amount-value">🔒 Encrypted</span>
                  <span className="status-badge encrypted">FHE Protected</span>
                </div>
              )}
            </div>
            
            {!bid.isVerified && (
              <button 
                className={`decrypt-btn ${decryptedAmount !== null ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedAmount !== null ? "Decrypted" : 
                 "Reveal Bid"}
              </button>
            )}
          </div>
          
          <div className="fhe-process">
            <h4>FHE Bidding Process</h4>
            <div className="process-steps">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <strong>Encrypted Bid Placement</strong>
                  <p>Bid amount encrypted with Zama FHE before submission</p>
                </div>
              </div>
              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <strong>Blind Auction Period</strong>
                  <p>All bids remain encrypted during the auction</p>
                </div>
              </div>
              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <strong>Bid Revelation</strong>
                  <p>Bids decrypted and verified after auction ends</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;

