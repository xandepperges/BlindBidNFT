import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface NFTBid {
  id: number;
  name: string;
  encryptedBid: string;
  publicReserve: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
  category: string;
  imageUrl: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [nftBids, setNftBids] = useState<NFTBid[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingBid, setCreatingBid] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newBidData, setNewBidData] = useState({ name: "", bidAmount: "", reservePrice: "", category: "Art", imageUrl: "" });
  const [selectedBid, setSelectedBid] = useState<NFTBid | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [stats, setStats] = useState({ totalBids: 0, verifiedBids: 0, activeAuctions: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      try {
        await initialize();
      } catch (error) {
        setTransactionStatus({ visible: true, status: "error", message: "FHEVM initialization failed" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };
    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        const businessIds = await contract.getAllBusinessIds();
        const bidsList: NFTBid[] = [];
        
        for (const businessId of businessIds) {
          try {
            const businessData = await contract.getBusinessData(businessId);
            bidsList.push({
              id: parseInt(businessId.replace('nft-', '')) || Date.now(),
              name: businessData.name,
              encryptedBid: businessId,
              publicReserve: Number(businessData.publicValue1) || 0,
              timestamp: Number(businessData.timestamp),
              creator: businessData.creator,
              isVerified: businessData.isVerified,
              decryptedValue: Number(businessData.decryptedValue) || 0,
              category: businessData.description || "Art",
              imageUrl: `https://picsum.photos/300/200?random=${businessId}`
            });
          } catch (e) {
            console.error('Error loading business data:', e);
          }
        }
        
        setNftBids(bidsList);
        updateStats(bidsList);
      } catch (e) {
        setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const updateStats = (bids: NFTBid[]) => {
    setStats({
      totalBids: bids.length,
      verifiedBids: bids.filter(b => b.isVerified).length,
      activeAuctions: bids.filter(b => Date.now()/1000 - b.timestamp < 60 * 60 * 24).length
    });
  };

  const createBid = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingBid(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted NFT bid..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const bidValue = parseInt(newBidData.bidAmount) || 0;
      const businessId = `nft-${Date.now()}`;
      const contractAddress = await contract.getAddress();
      
      const encryptedResult = await encrypt(contractAddress, address, bidValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newBidData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newBidData.reservePrice) || 0,
        0,
        newBidData.category
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "NFT bid created successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewBidData({ name: "", bidAmount: "", reservePrice: "", category: "Art", imageUrl: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingBid(false); 
    }
  };

  const decryptBid = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      const contractAddress = await contractRead.getAddress();
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const loadData = async () => {
    if (!isConnected) return;
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const bidsList: NFTBid[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          bidsList.push({
            id: parseInt(businessId.replace('nft-', '')) || Date.now(),
            name: businessData.name,
            encryptedBid: businessId,
            publicReserve: Number(businessData.publicValue1) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            category: businessData.description || "Art",
            imageUrl: `https://picsum.photos/300/200?random=${businessId}`
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setNftBids(bidsList);
      updateStats(bidsList);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredBids = nftBids.filter(bid => {
    const matchesSearch = bid.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "All" || bid.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", ...Array.from(new Set(nftBids.map(bid => bid.category)))];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>BlindBidNFT 🔒</h1>
            <p>FHE Protected NFT Bidding</p>
          </div>
          <ConnectButton />
        </header>
        <div className="connection-prompt">
          <div className="prompt-content">
            <h2>Connect to Start Private Bidding</h2>
            <p>Your NFT bids are encrypted with FHE technology</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="encryption-spinner"></div>
        <p>Initializing FHE Encryption...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="encryption-spinner"></div>
      <p>Loading encrypted bids...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>BlindBidNFT</h1>
          <p>FHE Encrypted NFT Auctions</p>
        </div>
        <div className="header-controls">
          <ConnectButton />
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Bids</h3>
          <div className="stat-value">{stats.totalBids}</div>
        </div>
        <div className="stat-card">
          <h3>Verified</h3>
          <div className="stat-value">{stats.verifiedBids}</div>
        </div>
        <div className="stat-card">
          <h3>Active</h3>
          <div className="stat-value">{stats.activeAuctions}</div>
        </div>
      </div>

      <div className="controls-section">
        <div className="search-filter">
          <input 
            type="text" 
            placeholder="Search NFTs..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="category-filter"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
            {isRefreshing ? "⟳" : "↻"}
          </button>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="create-bid-btn">
          + New Encrypted Bid
        </button>
      </div>

      <div className="nft-grid">
        {filteredBids.length === 0 ? (
          <div className="empty-state">
            <p>No encrypted bids found</p>
            <button onClick={() => setShowCreateModal(true)} className="create-first-btn">
              Create First Bid
            </button>
          </div>
        ) : (
          filteredBids.map((bid) => (
            <div key={bid.id} className="nft-card" onClick={() => setSelectedBid(bid)}>
              <img src={bid.imageUrl} alt={bid.name} className="nft-image" />
              <div className="nft-info">
                <h3>{bid.name}</h3>
                <p className="category">{bid.category}</p>
                <p className="reserve">Reserve: {bid.publicReserve} ETH</p>
                <div className={`status ${bid.isVerified ? 'verified' : 'encrypted'}`}>
                  {bid.isVerified ? `Bid: ${bid.decryptedValue} ETH` : '🔒 Encrypted Bid'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateBidModal
          onSubmit={createBid}
          onClose={() => setShowCreateModal(false)}
          creating={creatingBid}
          bidData={newBidData}
          setBidData={setNewBidData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedBid && (
        <BidDetailModal
          bid={selectedBid}
          onClose={() => setSelectedBid(null)}
          isDecrypting={fheIsDecrypting}
          decryptBid={() => decryptBid(selectedBid.encryptedBid)}
        />
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          {transactionStatus.message}
        </div>
      )}
    </div>
  );
};

const CreateBidModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  bidData: any;
  setBidData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, bidData, setBidData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'bidAmount' || name === 'reservePrice') {
      const intValue = value.replace(/[^\d]/g, '');
      setBidData({ ...bidData, [name]: intValue });
    } else {
      setBidData({ ...bidData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Encrypted NFT Bid</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE Encrypted Bidding</strong>
            <p>Your bid will be encrypted using Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>NFT Name</label>
            <input type="text" name="name" value={bidData.name} onChange={handleChange} />
          </div>
          
          <div className="form-group">
            <label>Encrypted Bid Amount (ETH)</label>
            <input type="number" name="bidAmount" value={bidData.bidAmount} onChange={handleChange} />
            <span className="data-label">FHE Encrypted</span>
          </div>
          
          <div className="form-group">
            <label>Public Reserve Price (ETH)</label>
            <input type="number" name="reservePrice" value={bidData.reservePrice} onChange={handleChange} />
            <span className="data-label">Public</span>
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={bidData.category} onChange={handleChange}>
              <option value="Art">Art</option>
              <option value="Collectibles">Collectibles</option>
              <option value="Photography">Photography</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !bidData.name || !bidData.bidAmount}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Bid"}
          </button>
        </div>
      </div>
    </div>
  );
};

const BidDetailModal: React.FC<{
  bid: NFTBid;
  onClose: () => void;
  isDecrypting: boolean;
  decryptBid: () => Promise<number | null>;
}> = ({ bid, onClose, isDecrypting, decryptBid }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const result = await decryptBid();
    setLocalDecrypted(result);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>NFT Bid Details</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-body">
          <img src={bid.imageUrl} alt={bid.name} className="detail-image" />
          
          <div className="bid-info">
            <h3>{bid.name}</h3>
            <div className="info-grid">
              <div className="info-item">
                <span>Category:</span>
                <strong>{bid.category}</strong>
              </div>
              <div className="info-item">
                <span>Reserve Price:</span>
                <strong>{bid.publicReserve} ETH</strong>
              </div>
              <div className="info-item">
                <span>Creator:</span>
                <strong>{bid.creator.substring(0, 8)}...{bid.creator.substring(36)}</strong>
              </div>
            </div>
            
            <div className="bid-status">
              <h4>Encrypted Bid</h4>
              <div className={`status-display ${bid.isVerified ? 'verified' : 'encrypted'}`}>
                {bid.isVerified ? (
                  <span>Decrypted Bid: {bid.decryptedValue} ETH ✅</span>
                ) : localDecrypted ? (
                  <span>Locally Decrypted: {localDecrypted} ETH 🔓</span>
                ) : (
                  <span>🔒 FHE Encrypted Bid</span>
                )}
              </div>
              
              {!bid.isVerified && (
                <button 
                  onClick={handleDecrypt} 
                  disabled={isDecrypting}
                  className="decrypt-btn"
                >
                  {isDecrypting ? "Decrypting..." : "Reveal Bid"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;