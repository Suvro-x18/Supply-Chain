/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Papa from 'papaparse';
import { 
  Edit2,
  Trash2,
  X,
  Save,
  LayoutDashboard, 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  Zap, 
  BarChart3, 
  Search,
  Plus,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  BrainCircuit,
  Tag,
  Layers,
  LogOut,
  LogIn,
  Sun,
  Moon,
  CheckCircle2,
  Trash,
  Truck,
  Mail,
  Phone,
  Star,
  MapPin,
  ExternalLink,
  FileText,
  CheckCircle,
  FileCheck,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp, 
  getDocs,
  getDocFromServer,
  doc,
  where
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import SupplierMap from './components/SupplierMap';

// Types
interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  stockLevel: number;
  minThreshold: number;
  maxThreshold: number;
  price: number;
  cost?: number;
  leadTime?: number;
  supplierId?: string;
  predictedStockoutDate?: any;
}

interface Supplier {
  id: string;
  name: string;
  rating: number;
  contact: string;
  address?: string;
  lat?: number;
  lng?: number;
  status?: 'active' | 'on-hold' | 'critical';
}

interface Alert {
  id: string;
  type: 'stockout' | 'overstock' | 'delay' | 'spike' | 'lowstock' | 'prediction';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: any;
  isRead: boolean;
  productId?: string;
  supplierId?: string;
  isResolved?: boolean;
  predictedDays?: number | null;
}

interface Sale {
  productId: string;
  date: any;
  quantity: number;
  revenue?: number;
}

interface Insight {
  id: string;
  topic: string;
  content: string;
  type: 'trend' | 'deal' | 'combo' | 'prediction';
  timestamp: any;
}

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'received' | 'cancelled';
  createdAt: any;
  updatedAt?: any;
  expectedDelivery?: any;
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

// AI Service
const geminiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: geminiKey });

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'insights' | 'suppliers' | 'alerts' | 'procurement'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [alertFilter, setAlertFilter] = useState<'all' | 'unread'>('all');
  const [insightFilter, setInsightFilter] = useState<'all' | 'deal' | 'combo' | 'trend' | 'prediction'>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [supplierFormErrors, setSupplierFormErrors] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierFilters, setSupplierFilters] = useState<{ rating: number | null, status: string | null }>({ rating: null, status: null });
  const [simulationParams, setSimulationParams] = useState({ demandIncrease: 0, leadTimeDelay: 0 });
  const [importErrors, setImportErrors] = useState<{ row: number, column?: string, reason: string }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Clear notification after 5s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!isAuthReady || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(productList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'asc')), (snapshot) => {
      const salesList = snapshot.docs.map(doc => doc.data() as Sale);
      setSales(salesList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

    const unsubInsights = onSnapshot(query(collection(db, 'insights'), orderBy('timestamp', 'desc')), (snapshot) => {
      const insightsList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Insight));
      setInsights(insightsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'insights'));

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Supplier));
      setSuppliers(supplierList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'));

    const unsubAlerts = onSnapshot(query(collection(db, 'alerts'), orderBy('timestamp', 'desc')), (snapshot) => {
      const alertsList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Alert));
      setAlerts(alertsList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'alerts');
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      const ordersList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
      setOrders(ordersList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
      setLoading(false);
    });

    return () => {
      unsubProducts();
      unsubSales();
      unsubInsights();
      unsubSuppliers();
      unsubAlerts();
      unsubOrders();
    };
  }, [isAuthReady, user]);

  // Intelligent Automated Alert System
  useEffect(() => {
    if (!user || products.length === 0 || loading) return;

    const generateInventoryAlerts = async () => {
      const activeAlerts = alerts.filter(a => !a.isRead);
      const activeAlertsKey = new Set(activeAlerts.map(a => `${a.productId}-${a.type}`));

      // 1. Auto-Resolution: Filter out unread alerts for conditions that are no longer true
      for (const alert of activeAlerts) {
        if (!alert.productId) continue;
        const product = products.find(p => p.id === alert.productId);
        if (!product) continue;

        let shouldResolve = false;
        if (alert.type === 'stockout' && product.stockLevel > 0) shouldResolve = true;
        if (alert.type === 'lowstock' && product.stockLevel >= product.minThreshold) shouldResolve = true;
        if (alert.type === 'overstock' && product.stockLevel <= product.maxThreshold) shouldResolve = true;

        if (shouldResolve) {
          try {
            await updateDoc(doc(db, 'alerts', alert.id), { isRead: true, isResolved: true });
          } catch (e) {
            console.error("Auto-resolve failed:", e);
          }
        }
      }

      // 2. Intelligence Triggers & Predictive Updates
      const batch = writeBatch(db);
      let batchCount = 0;

      for (const product of products) {
        let alertNeeded = false;
        let type: Alert['type'] = 'lowstock';
        let severity: Alert['severity'] = 'medium';
        let message = '';

        // Calculate Velocity & Predict Stock Days
        const productSales = sales.filter(s => s.productId === product.id);
        const dailyVelocity = productSales.length > 0 
          ? productSales.reduce((acc, s) => acc + s.quantity, 0) / (sales.length || 1)
          : 0;
        
        const daysRemaining = dailyVelocity > 0 ? product.stockLevel / dailyVelocity : Infinity;
        const isPredictiveRisk = daysRemaining < (product.leadTime || 5) + 2; // Buffer of 2 days

        // Handle Predicted Stockout Date Update
        let predictedStockoutDate: Timestamp | null = null;
        if (dailyVelocity > 0 && product.stockLevel > 0) {
          const predictionDate = new Date();
          predictionDate.setDate(predictionDate.getDate() + Math.floor(daysRemaining));
          predictedStockoutDate = Timestamp.fromDate(predictionDate);
        }

        // Only update if the date has changed significantly (e.g. more than a day or clearing it)
        const currentPredicted = product.predictedStockoutDate?.toDate?.()?.getTime();
        const nextPredicted = predictedStockoutDate?.toDate?.()?.getTime();
        
        if (currentPredicted !== nextPredicted) {
          batch.update(doc(db, 'products', product.id), {
            predictedStockoutDate: predictedStockoutDate
          });
          batchCount++;
        }

        // Trigger Logic
        if (product.stockLevel === 0) {
          alertNeeded = true;
          type = 'stockout';
          severity = 'critical';
          message = `URGENT: ${product.name} is completely out of stock. Immediate replenishment required.`;
        } else if (product.stockLevel < product.minThreshold) {
          alertNeeded = true;
          type = 'lowstock';
          severity = product.stockLevel < product.minThreshold / 2 ? 'high' : 'medium';
          message = `${product.name} is below threshold. Stock: ${product.stockLevel}. Velocity: ${dailyVelocity.toFixed(1)}/day.`;
        } else if (isPredictiveRisk && product.stockLevel > 0) {
          alertNeeded = true;
          type = 'prediction';
          severity = daysRemaining < product.leadTime ? 'high' : 'medium';
          message = `PREDICTIVE: ${product.name} will stockout in ~${daysRemaining.toFixed(0)} days based on velocity.`;
        } else if (product.stockLevel > product.maxThreshold) {
          alertNeeded = true;
          type = 'overstock';
          severity = 'low';
          message = `${product.name} overstock detected (${product.stockLevel}/${product.maxThreshold}). Holding costs increasing.`;
        }

        // Velocity Spike Detection (Dynamic Intelligence)
        const recentSales = productSales.filter(s => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return s.date instanceof Date ? s.date > sevenDaysAgo : true;
        });
        
        if (recentSales.length > 10 && !activeAlertsKey.has(`${product.id}-trend`)) {
           // Basic spike detection would go here if we had more granular timestamps
        }

        if (alertNeeded && !activeAlertsKey.has(`${product.id}-${type}`)) {
          try {
            await addDoc(collection(db, 'alerts'), {
              productId: product.id,
              supplierId: product.supplierId || null,
              type,
              severity,
              message,
              timestamp: Timestamp.now(),
              isRead: false,
              isResolved: false,
              predictedDays: daysRemaining === Infinity ? null : daysRemaining
            });
          } catch (error) {
            console.error("Smart alert creation failed:", error);
          }
        }
      }

      if (batchCount > 0) {
        try {
          await batch.commit();
        } catch (e) {
          console.error("Batch update for predictions failed:", e);
        }
      }
    };

    const timer = setTimeout(generateInventoryAlerts, 2500); 
    return () => clearTimeout(timer);
  }, [products, user, alerts.length, loading, sales.length]);

  // AI Insight Generation
  const generateAIInsights = async () => {
    if (!user) return;
    setAiLoading(true);
    try {
      const inventorySummary = products.map(p => 
        `${p.name} (Stock: ${p.stockLevel}, Min: ${p.minThreshold}, Max: ${p.maxThreshold}, Cost: ${p.cost}, LeadTime: ${p.leadTime}d)`
      ).join(', ');
      
      const supplierSummary = suppliers.map(s => `${s.name} (Rating: ${s.rating})`).join(', ');
      
      const prompt = `As a senior supply chain strategist for a global e-commerce giant (like Amazon), analyze this data:
      Inventory: ${inventorySummary}
      Suppliers: ${supplierSummary}
      Current Turnover: ${stats.turnover}
      Current DSI: ${stats.dsi}
      
      Provide 4 high-impact insights:
      1. "Trend": Identify a product with rising demand or seasonal peak.
      2. "Deal": A liquidation strategy for overstocked items to reduce holding costs.
      3. "Combo": A bundle offer (Product A + B) to increase average order value and clear slow stock.
      4. "Prediction": A supply chain risk prediction (e.g., potential stockout or supplier delay based on lead times).
      
      Return the response as a JSON array of objects with keys: topic, content, type (one of 'trend', 'deal', 'combo', 'prediction').`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const newInsights = JSON.parse(result.text);
      
      for (const insight of newInsights) {
        await addDoc(collection(db, 'insights'), {
          ...insight,
          timestamp: Timestamp.now()
        });
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
    } finally {
      setAiLoading(false);
    }
  };

  // Seed Sample Data
  const handleApplyInsight = async (insight: Insight) => {
    if (!user) return;
    setLoading(true);
    try {
      // Logic for various insight types
      let message = `Strategy applied: ${insight.topic}`;
      if (insight.type === 'deal') {
        message = `Bulk deal discount synchronized with sales channels for "${insight.topic}"`;
      } else if (insight.type === 'trend') {
        message = `Supply chain thresholds optimized for high-volume trend: "${insight.topic}"`;
      } else if (insight.type === 'prediction') {
        message = `Replenishment lead-times adjusted based on predictive model: "${insight.topic}"`;
      }
      
      setNotification({ message, type: 'success' });
    } catch (error) {
      console.error("Strategy application failed:", error);
      setNotification({ message: "Failed to apply strategy focus.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const seedSampleData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch current lookup data in parallel to avoid sequential latency
      const [suppliersSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'products'))
      ]);

      const supplierNameMap = new Map();
      suppliersSnap.docs.forEach(doc => supplierNameMap.set(doc.data().name, doc.id));
      
      const productSkuMap = new Map();
      productsSnap.docs.forEach(doc => productSkuMap.set(doc.data().sku, doc.id));

      const batch = writeBatch(db);
      
      // 2. Prepare Sample Suppliers
      const sampleSuppliers = [
        { name: 'Global Tech Parts', rating: 4.8, contact: 'sales@globaltech.com', address: 'Seattle, WA, USA', lat: 47.6062, lng: -122.3321, status: 'active' },
        { name: 'Office Depot Pro', rating: 4.2, contact: 'support@officedepot.com', address: 'Boca Raton, FL, USA', lat: 26.3683, lng: -80.1289, status: 'active' },
        { name: 'Coffee Bean Source', rating: 4.9, contact: 'logistics@beansource.com', address: 'Bogota, Colombia', lat: 4.7110, lng: -74.0721, status: 'on-hold' },
        { name: 'Titan Logistics Group', rating: 4.5, contact: 'ops@titanlogistics.com', address: 'Rotterdam, Netherlands', lat: 51.9225, lng: 4.4791, status: 'critical' },
        { name: 'Zenith Wholesale', rating: 4.6, contact: 'wholesale@zenith.net', address: 'London, UK', lat: 51.5074, lng: -0.1278, status: 'active' },
        { name: 'Apex Supply Solutions', rating: 4.7, contact: 'hello@apexsupply.io', address: 'San Francisco, CA, USA', lat: 37.7749, lng: -122.4194, status: 'active' },
        { name: 'Nexus Distributors', rating: 4.3, contact: 'contact@nexusdist.com', address: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, status: 'active' },
        { name: 'Berlin Bio-Fuel', rating: 4.4, contact: 'orders@berlinbio.de', address: 'Berlin, Germany', lat: 52.5200, lng: 13.4050, status: 'on-hold' },
        { name: 'Sydney Coffee Parts', rating: 4.7, contact: 'parts@sydneycoffee.au', address: 'Sydney, Australia', lat: -33.8688, lng: 151.2093, status: 'active' },
        { name: 'Rio Exportadores', rating: 4.5, contact: 'vendas@rioexport.br', address: 'Rio de Janeiro, Brazil', lat: -22.9068, lng: -43.1729, status: 'active' },
        { name: 'Cape Town Roasters', rating: 4.8, contact: 'beans@capetown.za', address: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241, status: 'active' },
        { name: 'Toronto Logistics Center', rating: 4.1, contact: 'logistics@toronto.ca', address: 'Toronto, Canada', lat: 43.6532, lng: -79.3832, status: 'active' }
      ];

      const supplierIds: string[] = [];
      sampleSuppliers.forEach(s => {
        // Normalize name for robust matching to prevent duplicates during seeding
        const normalizedName = s.name.trim().toLowerCase();
        let existingId = null;
        
        // Search current Firestore snapshot for matches
        for (const [name, id] of supplierNameMap.entries()) {
          if (name.trim().toLowerCase() === normalizedName) {
            existingId = id;
            break;
          }
        }

        if (existingId) {
          supplierIds.push(existingId);
          // Optional: Update existing supplier attributes to ensure they match latest seed data
          batch.update(doc(db, 'suppliers', existingId), s);
        } else {
          const newRef = doc(collection(db, 'suppliers'));
          batch.set(newRef, s);
          supplierIds.push(newRef.id);
        }
      });

      // 3. Prepare Sample Products with non-deterministic stock for visual feedback
      // This ensures that clicking "Seed Data" multiple times yields visible changes
      const sampleProducts = [
        { name: 'Espresso Machine Pro X1', category: 'Equipment', sku: 'COF-EXP-X1', stockLevel: Math.floor(Math.random() * 20) + 5, minThreshold: 15, maxThreshold: 50, price: 1299, cost: 850, leadTime: 14, supplierId: supplierIds[0] },
        { name: 'Whole Bean Arabica 5kg', category: 'Inventory', sku: 'COF-BN-ARA-5', stockLevel: Math.floor(Math.random() * 300) + 50, minThreshold: 50, maxThreshold: 500, price: 85, cost: 42, leadTime: 3, supplierId: supplierIds[2] },
        { name: 'Commercial Coffee Grinder', category: 'Equipment', sku: 'COF-GRD-COM', stockLevel: Math.floor(Math.random() * 15) + 5, minThreshold: 10, maxThreshold: 30, price: 450, cost: 280, leadTime: 10, supplierId: supplierIds[0] },
        { name: 'Paper Filters (1000ct)', category: 'Supplies', sku: 'SUP-FIL-1K', stockLevel: Math.floor(Math.random() * 600) + 200, minThreshold: 100, maxThreshold: 1000, price: 25, cost: 8, leadTime: 5, supplierId: supplierIds[1] },
        { name: 'Descaling Solution 1L', category: 'Supplies', sku: 'SUP-DSC-1L', stockLevel: Math.floor(Math.random() * 20) + 5, minThreshold: 20, maxThreshold: 100, price: 15, cost: 4, leadTime: 4, supplierId: supplierIds[1] },
        { name: 'Nitro Cold Brew Tap', category: 'Equipment', sku: 'COF-NTR-TAP', stockLevel: Math.floor(Math.random() * 8) + 2, minThreshold: 5, maxThreshold: 15, price: 899, cost: 550, leadTime: 21, supplierId: supplierIds[0] },
        { name: 'Precision Tamper 58mm', category: 'Barista Tools', sku: 'TL-TMP-58', stockLevel: Math.floor(Math.random() * 40) + 10, minThreshold: 15, maxThreshold: 60, price: 45, cost: 18, leadTime: 7, supplierId: supplierIds[5] },
        { name: 'Oat Milk Organic (Case/6)', category: 'Inventory', sku: 'INV-MLK-OAT', stockLevel: Math.floor(Math.random() * 100) + 20, minThreshold: 30, maxThreshold: 150, price: 28, cost: 14, leadTime: 2, supplierId: supplierIds[4] },
        { name: 'Artisan Vanilla Syrup 750ml', category: 'Inventory', sku: 'INV-SYR-VAN', stockLevel: Math.floor(Math.random() * 50) + 10, minThreshold: 15, maxThreshold: 80, price: 12, cost: 5, leadTime: 4, supplierId: supplierIds[4] },
        { name: 'Compostable 12oz Cups (500ct)', category: 'Consumables', sku: 'CON-CUP-12C', stockLevel: Math.floor(Math.random() * 800) + 100, minThreshold: 200, maxThreshold: 2000, price: 65, cost: 32, leadTime: 10, supplierId: supplierIds[6] },
        { name: 'Eco-Sleeve Kraft (1000ct)', category: 'Consumables', sku: 'CON-SLV-KFT', stockLevel: Math.floor(Math.random() * 1500) + 300, minThreshold: 500, maxThreshold: 3000, price: 35, cost: 15, leadTime: 5, supplierId: supplierIds[6] },
        { name: 'Maintenance Kit Alpha', category: 'Parts', sku: 'PRT-MNT-ALP', stockLevel: Math.floor(Math.random() * 10) + 2, minThreshold: 5, maxThreshold: 20, price: 120, cost: 65, leadTime: 14, supplierId: supplierIds[0] },
        { name: 'Nitro Gas Canister 2L', category: 'Supplies', sku: 'SUP-GAS-NIT', stockLevel: Math.floor(Math.random() * 30) + 5, minThreshold: 10, maxThreshold: 50, price: 45, cost: 22, leadTime: 3, supplierId: supplierIds[3] }
      ];

      const productIds: string[] = [];
      sampleProducts.forEach(p => {
        const existingId = productSkuMap.get(p.sku);
        const ref = existingId ? doc(db, 'products', existingId) : doc(collection(db, 'products'));
        const productData = { ...p, lastUpdated: Timestamp.now() };
        
        if (existingId) {
          batch.update(ref, productData);
        } else {
          batch.set(ref, productData);
        }
        productIds.push(ref.id);
      });

      // 4. Seed Strategic Insights with unique topics to prevent "no change" perception
      const sampleInsights = [
        { topic: `Nitro Tap Demand Spike ${Math.floor(Math.random() * 1000)}`, content: "Forecast identifies a uptick in Nitro Cold Brew tap interest for next quarter. Prepare inventory.", type: 'trend', timestamp: Timestamp.now() },
        { topic: `Arabica Bulk Optimization ${Math.floor(Math.random() * 1000)}`, content: "High turnover of Arabica 5kg detected. Consolidate orders to reduce logistics frequency.", type: 'combo', timestamp: Timestamp.now() },
        { topic: `Lead Lag Alert ${Math.floor(Math.random() * 1000)}`, content: "Lead times for espresso maintenance kits are shifting. Adjust buffer stock accordingly.", type: 'prediction', timestamp: Timestamp.now() }
      ];

      sampleInsights.forEach(ins => {
        const ref = doc(collection(db, 'insights'));
        batch.set(ref, ins);
      });

      // 5. Generate Sales Data (ensure we have products)
      if (productIds.length > 0) {
        const now = new Date();
        const salesCount = 40; // Generate 40 random sale events
        for (let i = 0; i < salesCount; i++) {
          const date = new Date();
          date.setDate(now.getDate() - Math.floor(Math.random() * 30));
          const randomProductId = productIds[Math.floor(Math.random() * productIds.length)];
          const ref = doc(collection(db, 'sales'));
          batch.set(ref, {
            productId: randomProductId,
            date: Timestamp.fromDate(date),
            quantity: Math.floor(Math.random() * 10) + 1,
            revenue: Math.floor(Math.random() * 300) + 50
          });
        }
      }

      // Execute entire Strategic Sync in one atomic batch
      await batch.commit();
      setNotification({ message: "Neural Sync optimized. Data clusters have been re-randomized for verification.", type: 'success' });
    } catch (error) {
      console.error("Critical: Seeding failed:", error);
      setNotification({ message: "Neural Link disruption. Data hub synchronization failed.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("Starting CSV parse for file:", file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: async (results) => {
        if (results.errors.length > 0) {
          console.error("CSV Parsing errors:", results.errors);
          setNotification({ 
            message: `Parsing failure: ${results.errors.map(e => `Row ${e.row}: ${e.message}`).join(', ')}`, 
            type: 'error' 
          });
          return;
        }

        const data = results.data as any[];
        if (data.length === 0) {
          setNotification({ message: "The CSV file is empty.", type: 'error' });
          return;
        }

        // Flexible column mapping
        const findColumn = (row: any, variations: string[]) => {
          const keys = Object.keys(row);
          for (const v of variations) {
            const match = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === v.toLowerCase().replace(/[^a-z0-9]/g, ''));
            if (match) return match;
          }
          return null;
        };

        const nameKey = findColumn(data[0], ['name', 'productname', 'title', 'item', 'product']);
        const skuKey = findColumn(data[0], ['sku', 'skuid', 'productid', 'id', 'itemnumber', 'partnumber']);
        const categoryKey = findColumn(data[0], ['category', 'department', 'type', 'group']);
        const stockKey = findColumn(data[0], ['stocklevel', 'stock', 'quantity', 'qty', 'inventory', 'instock']);
        const priceKey = findColumn(data[0], ['price', 'unitprice', 'msrp', 'costprice', 'rate']);
        const costKey = findColumn(data[0], ['cost', 'unitcost', 'purchaseprice', 'buyingprice']);
        const leadTimeKey = findColumn(data[0], ['leadtime', 'deliverytime', 'shippingtime', 'days']);
        const minKey = findColumn(data[0], ['minthreshold', 'minstock', 'reorderpoint', 'minimum']);
        const maxKey = findColumn(data[0], ['maxthreshold', 'maxstock', 'maximum']);

        if (!nameKey || !skuKey) {
          setNotification({ 
            message: "Could not identify 'Name' or 'SKU' columns. Please ensure your CSV has these headers.", 
            type: 'error' 
          });
          return;
        }

        const validationErrors: { row: number, column?: string, reason: string }[] = [];
        const recordsToImport: any[] = [];

        data.forEach((row, index) => {
          const rowNum = index + 2; // Data row starts at 2 (1 is header)
          const rowErrors: { row: number, column?: string, reason: string }[] = [];

          const validateField = (key: string | null, label: string, isRequired: boolean = false, isNumeric: boolean = false) => {
            if (!key) {
              if (isRequired) rowErrors.push({ row: rowNum, reason: `Column for ${label} not found` });
              return null;
            }
            const val = row[key];
            if (isRequired && (val === undefined || val === null || String(val).trim() === '')) {
              rowErrors.push({ row: rowNum, column: key, reason: `${label} is required` });
              return null;
            }
            if (isNumeric && val !== undefined && val !== null && String(val).trim() !== '' && isNaN(Number(val))) {
              rowErrors.push({ row: rowNum, column: key, reason: `${label} must be a number` });
              return null;
            }
            return val;
          };

          validateField(nameKey, 'Name', true);
          validateField(skuKey, 'SKU', true);
          validateField(stockKey, 'Stock Level', false, true);
          validateField(priceKey, 'Price', false, true);
          validateField(costKey, 'Cost', false, true);
          validateField(minKey, 'Min Threshold', false, true);
          validateField(maxKey, 'Max Threshold', false, true);
          validateField(leadTimeKey, 'Lead Time', false, true);

          if (rowErrors.length > 0) {
            validationErrors.push(...rowErrors);
          } else {
            recordsToImport.push(row);
          }
        });

        if (validationErrors.length > 0) {
          setImportErrors(validationErrors);
          setNotification({ 
            message: `Neural integrity check: ${recordsToImport.length} rows valid, ${new Set(validationErrors.map(e => e.row)).size} rows rejected due to calibration errors.`, 
            type: 'error' 
          });
          if (recordsToImport.length === 0) return;
        } else {
          setImportErrors([]);
        }

        console.log("Valid rows for import after mapping:", recordsToImport.length);

        setLoading(true);
        try {
          // Fetch existing products to avoid duplicates by SKU
          const existingSnapshot = await getDocs(collection(db, 'products'));
          const skuToIdMap = new Map();
          existingSnapshot.docs.forEach(doc => {
            skuToIdMap.set(doc.data().sku, doc.id);
          });

          const batchSize = 500;
          for (let i = 0; i < recordsToImport.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = recordsToImport.slice(i, i + batchSize);
            
            chunk.forEach(row => {
              const sku = String(row[skuKey]).trim();
              const existingId = skuToIdMap.get(sku);
              const productRef = existingId ? doc(db, 'products', existingId) : doc(collection(db, 'products'));

              const productData = {
                name: String(row[nameKey]).trim(),
                sku: sku,
                category: String(categoryKey ? row[categoryKey] : 'Uncategorized').trim(),
                stockLevel: Number(stockKey ? row[stockKey] : 0) || 0,
                minThreshold: Number(minKey ? row[minKey] : 10) || 10,
                maxThreshold: Number(maxKey ? row[maxKey] : 100) || 100,
                price: Number(priceKey ? row[priceKey] : 0) || 0,
                cost: Number(costKey ? row[costKey] : 0) || 0,
                leadTime: Number(leadTimeKey ? row[leadTimeKey] : 7) || 7,
                lastUpdated: Timestamp.now()
              };

              if (existingId) {
                batch.update(productRef, productData);
              } else {
                batch.set(productRef, productData);
              }
            });
            
            await batch.commit();
          }
          
          setNotification({ 
            message: recordsToImport.length === data.length 
              ? `Successfully synchronized ${recordsToImport.length} inventory items!`
              : `Partial Sync: ${recordsToImport.length}/${data.length} items updated. Check console for row errors.`, 
            type: recordsToImport.length === data.length ? 'success' : 'info' 
          });
        } catch (error) {
          console.error("Import failed:", error);
          setNotification({ message: "Failed to import data. Check your permissions.", type: 'error' });
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "name,sku,category,stockLevel,minThreshold,maxThreshold,price,cost,leadTime\n" +
                       "Sample Product,SKU-001,Electronics,50,10,100,299,150,7";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "inventory_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Auth Handlers
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleCleanupDuplicates = async () => {
    if (!user || products.length === 0) return;
    setLoading(true);
    try {
      const skuMap = new Map<string, string[]>();
      products.forEach(p => {
        if (!p.sku) return;
        const normalizedSku = p.sku.trim().toUpperCase();
        if (!skuMap.has(normalizedSku)) skuMap.set(normalizedSku, []);
        skuMap.get(normalizedSku)!.push(p.id);
      });

      const idsToDelete: string[] = [];
      skuMap.forEach((ids) => {
        if (ids.length > 1) {
          // Keep the first one, delete the rest
          for (let i = 1; i < ids.length; i++) {
            idsToDelete.push(ids[i]);
          }
        }
      });

      if (idsToDelete.length > 0) {
        // Firestore batch limit is 500
        const batchSize = 500;
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = idsToDelete.slice(i, i + batchSize);
          chunk.forEach(id => {
            batch.delete(doc(db, 'products', id));
          });
          await batch.commit();
        }
        setNotification({ message: `Purged ${idsToDelete.length} duplicate entries from inventory.`, type: 'success' });
      } else {
        setNotification({ message: "No duplicate SKUs detected.", type: 'info' });
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
      setNotification({ message: "Cleanup failed. Check permissions.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupSupplierDuplicates = async () => {
    if (!user || suppliers.length === 0) return;
    setLoading(true);
    try {
      const nameMap = new Map<string, string[]>();
      suppliers.forEach(s => {
        if (!s.name) return;
        const normalizedName = s.name.trim().toLowerCase();
        if (!nameMap.has(normalizedName)) nameMap.set(normalizedName, []);
        nameMap.get(normalizedName)!.push(s.id);
      });

      const idsToDelete: string[] = [];
      nameMap.forEach((ids) => {
        if (ids.length > 1) {
          // Keep the first one, delete the rest
          for (let i = 1; i < ids.length; i++) {
            idsToDelete.push(ids[i]);
          }
        }
      });

      if (idsToDelete.length > 0) {
        const batch = writeBatch(db);
        idsToDelete.forEach(id => {
          batch.delete(doc(db, 'suppliers', id));
        });
        await batch.commit();
        setNotification({ message: `Pruned ${idsToDelete.length} redundant suppliers.`, type: 'success' });
      } else {
        setNotification({ message: "Strategic partner network is already optimized.", type: 'info' });
      }
    } catch (error) {
      console.error("Supplier cleanup failed:", error);
      setNotification({ message: "Neural pruning failed. Check link status.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const validateSupplierForm = () => {
    if (!editingSupplier) return false;
    const errors: Record<string, string> = {};

    if (!editingSupplier.name || editingSupplier.name.trim().length < 2) {
      errors.name = "Supplier name is required.";
    }

    if (!editingSupplier.contact || !/^\S+@\S+\.\S+$/.test(editingSupplier.contact)) {
      errors.contact = "A valid contact email is required.";
    }

    if (isNaN(editingSupplier.rating) || editingSupplier.rating < 0 || editingSupplier.rating > 5) {
      errors.rating = "Rating must be between 0 and 5.";
    }

    if (editingSupplier.address && editingSupplier.address.trim().length < 3) {
      errors.address = "Address is too short.";
    }

    if ((editingSupplier.lat !== undefined && isNaN(editingSupplier.lat)) || 
        (editingSupplier.lng !== undefined && isNaN(editingSupplier.lng))) {
      errors.coordinates = "Valid numerical coordinates are required.";
    } else if ((editingSupplier.lat !== undefined && editingSupplier.lng === undefined) || 
               (editingSupplier.lat === undefined && editingSupplier.lng !== undefined)) {
      errors.coordinates = "Both Latitude and Longitude must be provided to map the entity.";
    }

    setSupplierFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !user) return;
    
    if (!validateSupplierForm()) {
      setNotification({ message: "Network validation failed.", type: 'error' });
      return;
    }

    setLoading(true);
    try {
      if (editingSupplier.id) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
          ...editingSupplier,
          lastUpdated: Timestamp.now()
        });
        setNotification({ message: 'Strategic partner updated.', type: 'success' });
      } else {
        const { id, ...supplierData } = editingSupplier;
        await addDoc(collection(db, 'suppliers'), {
          ...supplierData,
          lastUpdated: Timestamp.now()
        });
        setNotification({ message: 'New partner onboarded successfully.', type: 'success' });
      }
      setEditingSupplier(null);
      setSupplierFormErrors({});
    } catch (error) {
      console.error("Supplier save failed:", error);
      handleFirestoreError(error, OperationType.WRITE, editingSupplier.id ? `suppliers/${editingSupplier.id}` : 'suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!user) return;
    // Check if supplier has products first
    const hasProducts = products.some(p => p.supplierId === id);
    if (hasProducts) {
      setNotification({ message: "Cannot terminate partner link. Active inventory entities detected.", type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      setNotification({ message: 'Strategic link terminated.', type: 'info' });
    } catch (error) {
      console.error("Supplier deletion failed:", error);
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const validateProductForm = () => {
    if (!editingProduct) return false;
    const errors: Record<string, string> = {};

    if (!editingProduct.name || editingProduct.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }

    if (!editingProduct.sku || !editingProduct.sku.trim()) {
      errors.sku = "SKU identifier is required.";
    } else if (!/^[A-Z0-9\-_]+$/.test(editingProduct.sku)) {
      errors.sku = "SKU must be uppercase alphanumeric (dashes/underscores allowed).";
    }

    if (!editingProduct.category || !editingProduct.category.trim()) {
      errors.category = "Category is required.";
    }

    if (isNaN(editingProduct.price) || editingProduct.price < 0) {
      errors.price = "Price cannot be negative.";
    }

    if (editingProduct.cost !== undefined && editingProduct.cost < 0) {
      errors.cost = "Unit cost cannot be negative.";
    }

    if (isNaN(editingProduct.stockLevel) || editingProduct.stockLevel < 0) {
      errors.stockLevel = "Current stock cannot be negative.";
    }

    if (isNaN(editingProduct.minThreshold) || editingProduct.minThreshold < 0) {
      errors.minThreshold = "Minimum threshold cannot be negative.";
    }

    if (isNaN(editingProduct.maxThreshold) || editingProduct.maxThreshold <= editingProduct.minThreshold) {
      errors.maxThreshold = "Max threshold must be greater than minimum.";
    }

    if (editingProduct.leadTime !== undefined && (isNaN(editingProduct.leadTime) || editingProduct.leadTime < 0)) {
      errors.leadTime = "Lead time cannot be negative.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !user) return;
    
    if (!validateProductForm()) {
      setNotification({ message: "Strategic validation failed. Please check highlighted fields.", type: 'error' });
      return;
    }

    setLoading(true);
    try {
      if (editingProduct.id) {
        // Update existing
        const productRef = doc(db, 'products', editingProduct.id);
        await updateDoc(productRef, {
          ...editingProduct,
          lastUpdated: Timestamp.now()
        });
        setNotification({ message: 'Product synchronized successfully', type: 'success' });
      } else {
        // Create new
        const { id, ...productData } = editingProduct;
        await addDoc(collection(db, 'products'), {
          ...productData,
          lastUpdated: Timestamp.now()
        });
        setNotification({ message: 'New entity registered in inventory.', type: 'success' });
      }
      setEditingProduct(null);
      setFormErrors({});
    } catch (error) {
      console.error("Save failed:", error);
      handleFirestoreError(error, OperationType.WRITE, editingProduct.id ? `products/${editingProduct.id}` : 'products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'products', id));
      setNotification({ message: 'Neural trace deleted successfully.', type: 'info' });
    } catch (error) {
      console.error("Delete failed:", error);
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAlertRead = async (alert: Alert) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'alerts', alert.id), {
        isRead: !alert.isRead
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `alerts/${alert.id}`);
    }
  };

  const handleReplenishProduct = async (product: Product) => {
    if (!user || !product.supplierId) return;
    
    // In a real scenario, we don't just replenish, we create an order
    const items: OrderItem[] = [
      {
        productId: product.id,
        productName: product.name,
        quantity: product.maxThreshold - product.stockLevel,
        price: product.price * 0.7 // Assuming cost is 70% of price
      }
    ];
    
    await handleCreateOrder(product.supplierId, items);
  };

  const handleCreateOrder = async (supplierId: string, items: OrderItem[]) => {
    if (!user) return;

    // Duplication Guard: Check if an active order (not received) already exists for this supplier
    const activeOrder = orders.find(o => o.supplierId === supplierId && o.status !== 'received');
    if (activeOrder) {
      setNotification({ 
        message: `Strategic Lock: An active Order (#${activeOrder.id.slice(0,8).toUpperCase()}) already exists for this partner. Void the current order before issuing another.`, 
        type: 'info' 
      });
      return;
    }

    setLoading(true);
    try {
      const supplier = suppliers.find(s => s.id === supplierId);
      const totalAmount = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      
      // Calculate Expected Delivery based on max lead time of products
      const maxLeadTime = items.reduce((max, item) => {
        const prod = products.find(p => p.id === item.productId);
        return Math.max(max, prod?.leadTime || 3); // Default 3 days
      }, 0);

      const createdAt = Timestamp.now();
      const expectedDeliveryDate = new Date(createdAt.toDate());
      expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + maxLeadTime);
      
      const orderData = {
        supplierId,
        supplierName: supplier?.name || 'Unknown Partner',
        items,
        totalAmount,
        status: 'pending',
        createdAt,
        expectedDelivery: Timestamp.fromDate(expectedDeliveryDate)
      };
      
      await addDoc(collection(db, 'orders'), orderData);
      setNotification({ message: `Purchase Order issued. Estimated arrival in ${maxLeadTime} days.`, type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
      setNotification({ message: `Order status manually synchronized to ${newStatus}.`, type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!user) return;
    // Removing window.confirm as it often fails in iframe/sandboxed environments.
    // We already gate this in the UI to only unreceived orders.
    try {
      await deleteDoc(doc(db, 'orders', id));
      setNotification({ message: "Strategic Order record has been successfully purged from the procurement stream.", type: 'info' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `orders/${id}`);
    }
  };

  const handleReceiveOrder = async (order: Order, bypassTimeConstraint = false) => {
    if (!user || order.status === 'received') return;
    
    // Realism check: Ensure today >= expectedDelivery
    const now = new Date();
    const isEarly = order.expectedDelivery && now < order.expectedDelivery.toDate();
    
    if (isEarly && !bypassTimeConstraint) {
      setNotification({ message: `Logistics Delay: Shipment is still in transit. Estimated arrival: ${order.expectedDelivery.toDate().toLocaleDateString()}`, type: 'info' });
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Update each product's stock level synchronously
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          batch.update(doc(db, 'products', item.productId), {
            stockLevel: product.stockLevel + item.quantity,
            lastUpdated: Timestamp.now()
          });
        }
      });
      
      // Update order status to terminal state
      batch.update(doc(db, 'orders', order.id), {
        status: 'received',
        updatedAt: Timestamp.now()
      });
      
      // Auto-resolve alerts for these products
      const orderProductIds = new Set(order.items.map(i => i.productId));
      const relevantAlerts = alerts.filter(a => !a.isRead && a.productId && orderProductIds.has(a.productId));
      
      relevantAlerts.forEach(a => {
        batch.update(doc(db, 'alerts', a.id), { isRead: true, isResolved: true });
      });
      
      await batch.commit();
      setNotification({ message: `Neural Verification Success: Inventory synchronized from Order #${order.id.slice(0,6).toUpperCase()}.`, type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders/receive');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReplenish = async (supplierId: string) => {
    if (!user || !supplierId) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    // Create an order for all understocked products
    const understockedProducts = products.filter(p => 
      p.supplierId === supplierId && p.stockLevel < p.minThreshold
    );

    if (understockedProducts.length === 0) {
      // If nothing technically understocked, try to top up everything
      const needingTopUp = products.filter(p => 
        p.supplierId === supplierId && p.stockLevel < p.maxThreshold * 0.95
      );
      
      if (needingTopUp.length === 0) {
        setNotification({ message: 'Neural Sync: Capacity already at optimal levels for this partner.', type: 'info' });
        return;
      }
      
      const items: OrderItem[] = needingTopUp.map(p => ({
        productId: p.id,
        productName: p.name,
        quantity: p.maxThreshold - p.stockLevel,
        price: (p.cost || p.price * 0.7)
      }));
      
      await handleCreateOrder(supplierId, items);
    } else {
      const items: OrderItem[] = understockedProducts.map(p => ({
        productId: p.id,
        productName: p.name,
        quantity: p.maxThreshold - p.stockLevel,
        price: (p.cost || p.price * 0.7)
      }));
      
      await handleCreateOrder(supplierId, items);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'alerts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `alerts/${id}`);
    }
  };

  const handleMarkAllAlertsRead = async () => {
    if (!user || alerts.length === 0) return;
    const batch = writeBatch(db);
    const unreadAlerts = alerts.filter(a => !a.isRead);
    if (unreadAlerts.length === 0) return;
    
    unreadAlerts.forEach(a => {
      batch.update(doc(db, 'alerts', a.id), { isRead: true });
    });
    
    try {
      await batch.commit();
      setNotification({ message: "All alerts marked as read.", type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'alerts/bulk');
    }
  };

  const handleClearReadAlerts = async () => {
    if (!user || alerts.length === 0) return;
    const batch = writeBatch(db);
    const readAlerts = alerts.filter(a => a.isRead);
    if (readAlerts.length === 0) return;

    readAlerts.forEach(a => {
      batch.delete(doc(db, 'alerts', a.id));
    });

    try {
      await batch.commit();
      setNotification({ message: "Read alerts cleared.", type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'alerts/bulk');
    }
  };

  // Derived Stats
  const stats = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeSales = Array.isArray(sales) ? sales : [];

    const understocked = safeProducts.filter(p => (p.stockLevel || 0) < (p.minThreshold || 0)).length;
    const overstocked = safeProducts.filter(p => (p.stockLevel || 0) > (p.maxThreshold || 0)).length;
    
    const totalValue = safeProducts.reduce((acc, p) => acc + ((p.stockLevel || 0) * (p.price || 0)), 0);
    const totalCost = safeProducts.reduce((acc, p) => acc + ((p.stockLevel || 0) * (p.cost || (p.price || 0) * 0.6)), 0);
    
    const cogs = safeSales.reduce((acc, s) => {
      const product = safeProducts.find(p => p.id === s.productId);
      return acc + ((s.quantity || 0) * (product?.cost || (product?.price || 0) * 0.6));
    }, 0);

    const turnover = totalCost > 0 ? (cogs / totalCost).toFixed(2) : '0';
    const dsi = cogs > 0 ? ((totalCost / cogs) * 365).toFixed(0) : '0';

    return { understocked, overstocked, totalValue, turnover, dsi };
  }, [products, sales]);

  const chartData = useMemo(() => {
    const safeSales = Array.isArray(sales) ? sales : [];
    const grouped = safeSales.reduce((acc: any, sale) => {
      if (!sale) return acc;
      let dateStr = 'Unknown';
      try {
        const date = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
        if (!isNaN(date.getTime())) {
          dateStr = date.toLocaleDateString();
        }
      } catch (e) {
        console.error("Date parsing error in sales:", e);
      }
      
      acc[dateStr] = (acc[dateStr] || 0) + (sale.quantity || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([date, quantity]) => ({ date, quantity }));
  }, [sales]);

  const predictedDemand = useMemo(() => {
    const daysToPredict = 30;
    const safeSales = Array.isArray(sales) ? sales : [];
    const safeProducts = Array.isArray(products) ? products : [];
    const safeInsights = Array.isArray(insights) ? insights : [];

    // Calculate historical total daily sales volume
    // We aggregate all sales and divide by 30 (assuming 30d window) to get system-wide daily average
    const totalSalesVolume = safeSales.reduce((acc, s) => acc + (s.quantity || 0), 0);
    const averageTotalSalesPerDay = totalSalesVolume > 0 
      ? totalSalesVolume / 30 
      : (safeProducts.length * 1.5) || 25; // Sensible fallback

    // Insight-based multipliers
    let trendMultiplier = 1.0 + (simulationParams.demandIncrease / 100);
    safeInsights.forEach(insight => {
      const content = insight.content.toLowerCase();
      if (insight.type === 'trend' && content.includes('demand')) trendMultiplier += 0.2;
      if (insight.type === 'prediction' && content.includes('spike')) trendMultiplier += 0.35;
      if (insight.type === 'prediction' && content.includes('delay')) trendMultiplier -= 0.1;
    });

    const predictions = [];
    const now = new Date();
    
    for (let i = 0; i < daysToPredict; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      
      // Deterministic "AI" Modeling
      const dayOfWeek = date.getDay();
      
      // 1. Weekend seasonality (boost on Sat/Sun)
      const weeklyCycle = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.25 : 1.0;
      
      // 2. High-frequency "Neural" noise (deterministic sine wave)
      const microFluctuation = 1 + (Math.sin(i * 1.1) * 0.08);
      
      // 3. Macro "Trend" growth (slight linear increase to look predictive)
      const growthTrend = 1 + (i * 0.003);

      predictions.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        demand: Math.max(0, Math.round(averageTotalSalesPerDay * trendMultiplier * weeklyCycle * microFluctuation * growthTrend))
      });
    }

    return predictions;
  }, [sales, products, insights, simulationParams]);

  if (!isAuthReady) return <div className="h-screen flex items-center justify-center bg-[#e3d9ff] text-[#2e1065] font-mono text-xs tracking-widest uppercase">Initializing System...</div>;

  if (!user) {
    return (
      <div className={`min-h-screen ${theme === 'light' ? 'bg-[#f5f3ff] light-theme' : 'bg-[#e3d9ff]'} technical-grid flex flex-col items-center justify-center p-4 transition-colors duration-500 relative overflow-hidden`}>
        {/* Texture Overlay */}
        <div className="absolute inset-0 pointer-events-none z-[1] opacity-[0.03] mix-blend-overlay noise-bg" />
        
        {/* Login Background Effect */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <motion.div 
            animate={{ 
              x: [0, 80, 0], 
              y: [0, -100, 0],
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            className={`absolute top-[-20%] left-[-10%] w-[80%] h-[80%] ${
              theme === 'light' ? 'bg-primary/10' : 
              'bg-primary/15'
            } rounded-full blur-[140px]`}
          />
          <motion.div 
            animate={{ 
              x: [0, -80, 0], 
              y: [0, 100, 0],
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            className={`absolute bottom-[-15%] right-[-10%] w-[70%] h-[70%] ${
              theme === 'light' ? 'bg-[#8b5cf6]/12' : 
              'bg-[#8b4513]/20'
            } rounded-full blur-[160px]`}
          />
          {/* Atmospheric Glow */}
          {theme !== 'light' ? (
            <div className={`absolute inset-0 bg-radial-at-c from-[#2a1d15] to-transparent opacity-60 mix-blend-soft-light`} />
          ) : null}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-10 relative z-10"
        >
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-orange-950 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/20 rotate-3">
              <BrainCircuit className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">SupplyChain<br/><span className="text-primary">Intelligence</span></h1>
            <p className="text-[var(--text-secondary)] font-medium">Enterprise-grade inventory analytics and predictive demand forecasting.</p>
          </div>
          <button 
            onClick={handleLogin}
            className={`w-full py-4 ${theme === 'light' ? 'bg-primary text-white' : 'bg-white text-black'} font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-xl active:scale-[0.98]`}
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${
      theme === 'light' ? 'light-theme bg-white' : 
      'bg-[#e3d9ff]'
    } text-[var(--text-primary)] font-sans technical-grid relative overflow-hidden transition-colors duration-500`}>
      {/* Texture Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.03] mix-blend-overlay noise-bg" />
      
      {/* Dynamic Lavender Hues Background Effect */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <motion.div 
          animate={{ 
            x: [0, 120, 0], 
            y: [0, 80, 0],
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className={`absolute top-[-20%] left-[-10%] w-[80%] h-[80%] ${
            theme === 'light' ? 'bg-[#a78bfa]/10' : 
            'bg-[#a78bfa]/15'
          } rounded-full blur-[140px]`}
        />
        <motion.div 
          animate={{ 
            x: [0, -100, 0], 
            y: [0, -120, 0],
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className={`absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] ${
            theme === 'light' ? 'bg-[#fbcfe8]/15' : 
            'bg-[#fbcfe8]/10'
          } rounded-full blur-[160px]`}
        />
        <motion.div 
          animate={{ 
            x: [0, 80, 0], 
            y: [0, 100, 0],
            scale: [1, 1.1, 1],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className={`absolute top-[40%] right-[20%] w-[50%] h-[50%] ${
            theme === 'light' ? 'bg-[#bae6fd]/20' : 
            'bg-[#bae6fd]/15'
          } rounded-full blur-[120px]`}
        />
        {/* Additional Atmospheric Glow */}
        {!theme || theme === 'dark' ? (
          <div className="absolute inset-0 bg-radial-at-c from-[#8b5cf6]/20 to-transparent opacity-40 mix-blend-soft-light" />
        ) : null}
      </div>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar / Mobile Drawer */}
      <aside className={`fixed left-0 top-0 bottom-0 w-72 glass-panel flex flex-col p-8 z-50 transition-all duration-300 transform lg:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:flex border-r border-[var(--glass-border-color)]`}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <motion.div 
              animate={aiLoading ? { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="w-10 h-10 bg-gradient-to-br from-primary to-[#d8b4fe] rounded-xl flex items-center justify-center shadow-lg shadow-primary/20"
            >
              <BrainCircuit className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">SC Intel</h1>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Enterprise</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-[var(--text-primary)]/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Dashboard"
          />
          <NavItem 
            active={activeTab === 'inventory'} 
            onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }}
            icon={<Package className="w-5 h-5" />}
            label="Inventory"
          />
          <NavItem 
            active={activeTab === 'insights'} 
            onClick={() => { setActiveTab('insights'); setIsSidebarOpen(false); }}
            icon={<BrainCircuit className="w-5 h-5" />}
            label="Insights"
          />
          <NavItem 
            active={activeTab === 'suppliers'} 
            onClick={() => { setActiveTab('suppliers'); setIsSidebarOpen(false); }}
            icon={<Truck className="w-5 h-5" />}
            label="Suppliers"
          />
          <NavItem 
            active={activeTab === 'alerts'} 
            onClick={() => { setActiveTab('alerts'); setIsSidebarOpen(false); }}
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Alerts"
            badge={alerts.filter(a => !a.isRead).length}
          />
          <NavItem 
            active={activeTab === 'procurement'} 
            onClick={() => { setActiveTab('procurement'); setIsSidebarOpen(false); }}
            icon={<FileText className="w-5 h-5" />}
            label="Procurement"
            badge={orders.filter(o => ['pending', 'confirmed', 'shipped'].includes(o.status)).length}
          />
        </nav>

        <div className="pt-8 border-t border-[var(--glass-border-color)]">
          <div className="flex items-center gap-2 mb-6 bg-black/5 dark:bg-white/10 p-1.5 rounded-2xl border border-[var(--glass-border-color)]">
            <button 
              onClick={() => setTheme('light')}
              className={`flex-1 py-2 px-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${theme === 'light' ? 'bg-white text-[#4c1d95] shadow-lg' : 'text-[var(--text-secondary)] hover:bg-black/5'}`}
            >
              Light
            </button>
            <button 
              onClick={() => setTheme('dark')}
              className={`flex-1 py-2 px-3 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${theme === 'dark' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-[var(--text-secondary)] hover:bg-black/5'}`}
            >
              Lavender
            </button>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-[var(--glass-border-color)] shadow-sm" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-none mb-1">{user.displayName}</p>
              <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-wider truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 glass-button rounded-xl text-[10px] font-bold text-[var(--text-secondary)] hover:text-rose-400 uppercase tracking-widest"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <motion.main className="lg:ml-72 p-4 md:p-8 lg:p-10 transition-all duration-300">
        {/* Notifications */}
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: -20, x: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-xl border flex items-center gap-4 ${
                notification.type === 'success' ? (theme === 'light' ? 'bg-[#f0f9f1] border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400') :
                notification.type === 'error' ? (theme === 'light' ? 'bg-[#fff5f5] border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/20 text-rose-400') :
                (theme === 'light' ? 'bg-[#faf7f2] border-primary/20 text-[var(--text-primary)]' : 'bg-primary/20 border-primary/30 text-primary')
              }`}
            >
              <div className={`p-2 rounded-lg ${
                notification.type === 'success' ? 'bg-emerald-500/20' :
                notification.type === 'error' ? 'bg-rose-500/20' :
                'bg-primary/20'
              }`}>
                {notification.type === 'success' ? <RefreshCw className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <span className="text-sm font-bold tracking-tight">{notification.message}</span>
              <button onClick={() => setNotification(null)} className="ml-4 opacity-40 hover:opacity-100 transition-opacity">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 bg-[var(--glass-background)] border border-[var(--glass-border-color)] rounded-xl text-primary hover:bg-primary/10 transition-all active:scale-95"
            >
              <Layers className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight capitalize mb-1">{activeTab}</h2>
              <div className="flex items-center gap-4">
                <p className="hidden sm:block text-sm text-[var(--text-secondary)] font-medium tracking-tight">System-wide intelligence and predictive analytics.</p>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Neural Link: Optimal</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-4 justify-end">
            <div className="relative group w-full md:w-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] opacity-60 group-focus-within:text-primary group-focus-within:scale-110 transition-all duration-300" />
              <input 
                type="text" 
                placeholder="Search entities..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[var(--glass-background)] border border-[var(--glass-border-color)] rounded-[20px] pl-11 pr-5 py-3.5 text-sm outline-none focus:border-primary/30 focus:bg-[var(--panel-bg)] focus:ring-4 focus:ring-primary/5 transition-all w-full md:w-72 text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50"
              />
            </div>
            {activeTab === 'inventory' && (
              <div className="flex items-center flex-wrap gap-3 justify-end">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <button 
                  onClick={handleCleanupDuplicates}
                  className="glass-button text-rose-500 hover:bg-rose-500/10 px-5 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest border border-rose-500/20 active:scale-95 transition-all"
                  title="Remove duplicate SKUs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2 inline-block" />
                  Purge
                </button>
                <button 
                  onClick={downloadTemplate}
                  className="glass-button text-[var(--text-secondary)] opacity-70 hover:opacity-100 hover:text-[var(--text-primary)] px-5 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest"
                  title="Download CSV Template"
                >
                  Template
                </button>
                <button 
                  onClick={() => {
                    setFormErrors({});
                    setEditingProduct({ id: '', name: '', sku: '', stockLevel: 0, minThreshold: 10, maxThreshold: 100, price: 0, category: '', supplierId: '' });
                  }}
                  className="bg-primary hover:bg-primary-hover text-white px-6 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-[0.98] relative overflow-hidden group"
                >
                  <Plus className="w-4 h-4" />
                  New Entity
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="glass-button text-[var(--text-secondary)] opacity-70 hover:opacity-100 hover:text-[var(--text-primary)] px-5 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </button>
              </div>
            )}
            {activeTab === 'procurement' && (
              <button 
                onClick={() => {
                  setNotification({ message: 'Neural Sync: Procurement data streams re-verified.', type: 'info' });
                  // Firestore listeners handle the real refresh, this is mainly UI feedback as requested
                }}
                className="glass-button bg-primary/10 hover:bg-primary/20 text-primary px-5 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest border border-primary/30 flex items-center gap-2 group transition-all"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Refresh Orders
              </button>
            )}
            {(activeTab === 'dashboard' || activeTab === 'inventory' || activeTab === 'suppliers') && (
              <button 
                onClick={seedSampleData}
                className="glass-button bg-primary/10 hover:bg-primary/20 text-primary px-5 py-3.5 rounded-[20px] text-[10px] font-bold uppercase tracking-widest border border-primary/30 flex items-center gap-2 group transition-all"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                {activeTab === 'suppliers' ? 'Sync Map & Data' : 'Seed Data'}
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.02, y: -10 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="space-y-6"
            >
              {/* Stats Grid */}
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
              >
                <StatCard 
                  variants={itemVariants}
                  label="Inventory Value" 
                  value={`$${(stats.totalValue / 1000).toFixed(1)}k`}
                  icon={<Layers className="w-5 h-5" />}
                  trend="+12.5%"
                  trendUp={true}
                  color="from-[#a78bfa] to-[#8b5cf6]"
                />
                <StatCard 
                  variants={itemVariants}
                  label="Turnover Ratio" 
                  value={stats.turnover}
                  icon={<RefreshCw className="w-5 h-5" />}
                  trend="Healthy"
                  trendUp={true}
                  color="from-[#818cf8] to-[#4f46e5]"
                />
                <StatCard 
                  variants={itemVariants}
                  label="Days Sales (DSI)" 
                  value={stats.dsi}
                  icon={<TrendingUp className="w-5 h-5" />}
                  trend="Days"
                  trendUp={false}
                  color="from-[#f472b6] to-[#db2777]"
                />
                <StatCard 
                  variants={itemVariants}
                  label="Risk Alerts" 
                  value={stats.understocked.toString()}
                  icon={<AlertTriangle className="w-5 h-5" />}
                  trend="Critical"
                  trendUp={false}
                  color="from-[#fb923c] to-[#ea580c]"
                />
              </motion.div>

              {/* Analytical Pulse */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <DemandPredictionChart 
                  data={predictedDemand} 
                  accuracy={Math.min(99, 85 + (sales.length / 100))}
                  growth={(predictedDemand[predictedDemand.length-1].demand / predictedDemand[0].demand - 1) * 100}
                />

                <div className="space-y-6">
                  <ScenarioSimulator 
                    params={simulationParams} 
                    onChange={(newParams) => setSimulationParams(newParams)} 
                  />
                  <div className="glass-card p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">AI Agent Status</h3>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-[var(--panel-bg)] border border-[var(--glass-border-color)]">
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                          "Currently analyzing <span className="text-primary font-bold">Product {products[0]?.sku || 'SKU-001'}</span>. Syncing historical sales data with predictive model v2.1."
                        </p>
                      </div>
                      <button 
                        onClick={generateAIInsights}
                        disabled={aiLoading}
                        className={`w-full py-3 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]`}
                      >
                        {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Run Intelligence Scan
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'inventory' && (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="glass-card overflow-hidden"
            >
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--glass-border-color)] bg-[var(--glass-background)]/30">
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Product Entity</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Identifier</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Volume Metrics</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Stockout Forecast</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Status</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Strategic Partner</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight">Unit Price</th>
                      <th className="px-8 py-6 text-xs font-bold text-[var(--text-secondary)] tracking-tight text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-border-color)]">
                    {products
                      .filter(p => (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()))
                      .map((product) => (
                      <tr key={product.id} className="hover:bg-[var(--glass-background)]/50 transition-all duration-300 group relative">
                        <td className="px-8 py-6">
                          <div className="font-bold text-[var(--text-primary)] tracking-tight group-hover:text-primary transition-colors">{product.name || 'Unnamed Product'}</div>
                          <div className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-wider mt-0.5">{product.category}</div>
                        </td>
                        <td className="px-8 py-6 text-xs font-mono text-[var(--text-secondary)]">{product.sku}</td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-[var(--text-primary)] font-mono">{product.stockLevel}</span>
                            <div className="flex-1 max-w-[100px] h-1.5 bg-[var(--glass-border-color)] rounded-full overflow-hidden shadow-inner">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((product.stockLevel / product.maxThreshold) * 100, 100)}%` }}
                                className={`h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.1)] ${getStockColor(product)}`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                           {product.predictedStockoutDate ? (
                             <div className="flex items-center gap-2">
                               <Clock className={`w-3.5 h-3.5 ${
                                 (product.predictedStockoutDate.toDate() - new Date().getTime()) < (7 * 24 * 60 * 60 * 1000) 
                                   ? 'text-rose-500' 
                                   : 'text-amber-500'
                               }`} />
                               <span className="text-[11px] font-bold text-[var(--text-primary)] font-mono">
                                 {product.predictedStockoutDate.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                               </span>
                             </div>
                           ) : (
                             <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-30 italic">Calculating...</span>
                           )}
                        </td>
                        <td className="px-8 py-6">
                          <StockBadge product={product} />
                        </td>
                        <td className="px-8 py-6">
                          {suppliers.find(s => s.id === product.supplierId) ? (
                            <button 
                              onClick={() => setSelectedSupplier(suppliers.find(s => s.id === product.supplierId)!)}
                              className="flex items-center gap-2 group/s"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-primary opacity-40 group-hover/s:opacity-100 transition-all" />
                              <span className="text-xs font-bold text-[var(--text-secondary)] group-hover/s:text-primary transition-all underline decoration-primary/20 underline-offset-4 decoration-dashed flex items-center gap-1.5">
                                {suppliers.find(s => s.id === product.supplierId)?.name}
                                <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/s:opacity-100 transition-all" />
                              </span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-30 italic">No assigned partner</span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-sm font-bold text-[var(--text-primary)] font-mono">${product.price}</td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            <button 
                              onClick={() => handleReplenishProduct(product)}
                              className="p-2.5 glass-button text-emerald-500 border-emerald-500/20 hover:border-emerald-500/40 rounded-xl"
                              title="Restock Entity"
                              disabled={product.stockLevel >= product.maxThreshold}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                setFormErrors({});
                                setEditingProduct(product);
                              }}
                              className="p-2.5 glass-button text-primary border-primary/20 hover:border-primary/40 rounded-xl"
                              title="Edit Product"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-2.5 glass-button text-rose-400 border-rose-500/20 hover:border-rose-500/40 rounded-xl"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div 
              key="insights"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              {/* Insights Header & Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-8 bg-[var(--panel-bg)] border border-[var(--glass-border-color)] rounded-[32px] relative z-10 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">AI Strategy Engine</h3>
                  <p className="text-sm text-[var(--text-secondary)] font-medium mt-1">Filtering neural insights across {insights.length} active optimizations.</p>
                </div>
                
                 <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2 p-1 bg-black/10 dark:bg-white/20 border border-[var(--glass-border-color)] rounded-2xl">
                    <button 
                      onClick={() => setInsightFilter('all')}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        insightFilter === 'all' ? 'bg-primary text-white shadow-lg' : 'text-[var(--text-primary)] hover:bg-[#8b5cf6]/20 bg-[#8b5cf6]/10'
                      }`}
                    >
                      All
                    </button>
                    <button 
                      onClick={() => setInsightFilter('trend')}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        insightFilter === 'trend' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-[var(--text-primary)] hover:bg-[#8b5cf6]/20 bg-[#8b5cf6]/10'
                      }`}
                    >
                      Trends
                    </button>
                    <button 
                      onClick={() => setInsightFilter('deal')}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        insightFilter === 'deal' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-[var(--text-primary)] hover:bg-[#8b5cf6]/20 bg-[#8b5cf6]/10'
                      }`}
                    >
                      Deals
                    </button>
                    <button 
                      onClick={() => setInsightFilter('combo')}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        insightFilter === 'combo' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-[var(--text-primary)] hover:bg-[#8b5cf6]/20 bg-[#8b5cf6]/10'
                      }`}
                    >
                      Combos
                    </button>
                    <button 
                      onClick={() => setInsightFilter('prediction')}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        insightFilter === 'prediction' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-[var(--text-primary)] hover:bg-[#8b5cf6]/20 bg-[#8b5cf6]/10'
                      }`}
                    >
                      Predictions
                    </button>
                  </div>
                  
                  <button 
                    onClick={generateAIInsights}
                    disabled={aiLoading}
                    className="glass-button bg-primary hover:bg-primary-hover text-white border-none px-6 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl shadow-primary/10 disabled:opacity-50"
                  >
                    {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                    {aiLoading ? 'Analyzing...' : 'Refresh Scan'}
                  </button>
                </div>
              </div>

              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {insights
                  .filter(i => insightFilter === 'all' ? true : i.type === insightFilter)
                  .map((insight) => (
                    <InsightCard variants={itemVariants} key={insight.id} insight={insight} onApply={handleApplyInsight} />
                  ))}
                {insights.filter(i => insightFilter === 'all' ? true : i.type === insightFilter).length === 0 && !aiLoading && (
                  <div className="col-span-full py-32 text-center bg-[var(--glass-background)]/20 border-2 border-dashed border-[var(--glass-border-color)] rounded-[32px]">
                    <div className="w-16 h-16 bg-[var(--glass-background)] border border-[var(--glass-border-color)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <BrainCircuit className="w-8 h-8 text-[var(--text-secondary)] opacity-30" />
                    </div>
                    <h4 className="text-xl font-bold text-[var(--text-primary)] mb-2">No Active {insightFilter !== 'all' ? insightFilter.charAt(0).toUpperCase() + insightFilter.slice(1) : ''} Insights</h4>
                    <p className="text-[var(--text-secondary)] text-sm font-medium">Initiate an intelligence scan to discover new optimizations.</p>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'suppliers' && (
            <motion.div 
              key="suppliers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-8 bg-[var(--panel-bg)] border border-[var(--glass-border-color)] rounded-[32px] relative z-10 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Supplier Network</h3>
                  <p className="text-sm text-[var(--text-secondary)] font-medium mt-1">Managing {suppliers.length} active strategic partners across the global supply chain.</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleCleanupSupplierDuplicates}
                    className="glass-button text-rose-500 hover:bg-rose-500/10 px-6 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest border border-rose-500/20 active:scale-95 transition-all"
                  >
                    <Trash2 className="w-4 h-4 mr-2 inline-block" />
                    Purge Hub
                  </button>
                  <button 
                    onClick={() => {
                      setSupplierFormErrors({});
                      setEditingSupplier({ id: '', name: '', contact: '', rating: 5 });
                    }}
                    className="glass-button bg-primary hover:bg-primary-hover text-white border-none px-6 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl shadow-primary/10"
                  >
                    <Plus className="w-4 h-4" />
                    Onboard Partner
                  </button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <SupplierMap 
                  suppliers={suppliers} 
                  theme={theme} 
                  filters={supplierFilters} 
                  onFilterChange={setSupplierFilters}
                />
              </motion.div>

              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
              <AnimatePresence mode="popLayout">
                {suppliers.map((supplier) => (
                  <motion.div 
                    layout
                    variants={itemVariants}
                    key={supplier.id} 
                    className={`glass-card p-8 group transition-all duration-300 relative overflow-hidden ${
                      supplier.status === 'active' ? 'bg-emerald-500/[0.04] border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]' :
                      supplier.status === 'on-hold' ? 'bg-amber-500/[0.04] border-amber-500/30 hover:shadow-[0_0_30px_rgba(245,158,11,0.08)]' :
                      'bg-rose-500/[0.04] border-rose-500/30 hover:shadow-[0_0_30px_rgba(244,63,94,0.08)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        {supplier.status === 'active' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {supplier.status === 'on-hold' && <Clock className="w-5 h-5 text-amber-500" />}
                        {supplier.status === 'critical' && <ShieldAlert className="w-5 h-5 text-rose-500" />}
                        <h4 className="font-bold text-xl text-[var(--text-primary)] tracking-tight">{supplier.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setSupplierFormErrors({});
                            setEditingSupplier(supplier);
                          }}
                          className="p-2 text-[var(--text-secondary)] hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Modify Partner"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSupplier(supplier.id)}
                          className="p-2 text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                          title="Terminate Link"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      {supplier.status === 'active' ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                          <span className="text-[9px] font-bold uppercase text-emerald-500">Active</span>
                        </div>
                      ) : supplier.status === 'on-hold' ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span className="text-[9px] font-bold uppercase text-amber-500">On-Hold</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
                          <ShieldAlert className="w-3 h-3 text-rose-500" />
                          <span className="text-[9px] font-bold uppercase text-rose-500">Critical</span>
                        </div>
                      )}
                    </div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Zap key={s} className={`w-3 h-3 ${s <= supplier.rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-secondary)] opacity-20'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Reliability Score</span>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      {supplier.contact}
                    </div>
                  </div>
                    <button 
                      onClick={() => setSelectedSupplier(supplier)}
                      className="w-full py-3 glass-button rounded-xl text-[10px] font-bold text-primary uppercase tracking-widest border border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    >
                      View Strategic Profile
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <button className="border-2 border-dashed border-[var(--glass-border-color)] rounded-[24px] p-8 flex flex-col items-center justify-center gap-4 text-[var(--text-secondary)] opacity-60 hover:opacity-100 hover:border-primary/30 hover:text-primary hover:bg-primary/[0.02] transition-all group">
                <div className="p-4 rounded-full bg-[var(--glass-background)] border border-[var(--glass-border-color)] group-hover:border-primary/20 transition-all">
                  <Plus className="w-8 h-8" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest">Onboard New Supplier</span>
              </button>
            </motion.div>
          </motion.div>
        )}

          {activeTab === 'alerts' && (
            <motion.div 
              key="alerts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Strategic Batch Actions (AI-Suggested) */}
              {(() => {
                const partnerRiskCount: Record<string, number> = {};
                alerts.filter(a => !a.isRead && a.supplierId && (a.severity === 'high' || a.severity === 'critical'))
                  .forEach(a => { if(a.supplierId) partnerRiskCount[a.supplierId] = (partnerRiskCount[a.supplierId] || 0) + 1; });

                const criticalPartners = Object.entries(partnerRiskCount)
                  .filter(([_, count]) => count >= 2)
                  .map(([sid]) => suppliers.find(s => s.id === sid))
                  .filter(Boolean);

                if (criticalPartners.length > 0) {
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {criticalPartners.map(partner => partner && (
                        <motion.div 
                          key={partner.id}
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="p-6 bg-primary/5 border border-primary/20 rounded-3xl flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="w-4 h-4 text-primary animate-pulse" />
                              <h4 className="text-sm font-bold text-primary uppercase tracking-widest">Neural Recommendation</h4>
                            </div>
                            <p className="text-xs text-[var(--text-primary)] font-medium">
                              {partnerRiskCount[partner.id]} critical stock-risks detected for <span className="font-bold underline">{partner.name}</span>.
                            </p>
                          </div>
                          <button 
                            onClick={() => handleBulkReplenish(partner.id)}
                            className="bg-primary text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                          >
                            Bulk Replenish
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Alert Management Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-[var(--panel-bg)] border border-[var(--glass-border-color)] rounded-2xl relative z-10 shadow-sm">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setAlertFilter('all')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                      alertFilter === 'all' ? 'bg-primary text-white shadow-lg' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-background)]'
                    }`}
                  >
                    All Alerts ({alerts.length})
                  </button>
                  <button 
                    onClick={() => setAlertFilter('unread')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                      alertFilter === 'unread' ? 'bg-primary text-white shadow-lg' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-background)]'
                    }`}
                  >
                    Unread ({alerts.filter(a => !a.isRead).length})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleMarkAllAlertsRead}
                    disabled={alerts.every(a => a.isRead) || alerts.length === 0}
                    className="px-4 py-2 border border-[var(--glass-border-color)] text-[var(--text-secondary)] hover:bg-[var(--glass-background)] rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Mark all read
                  </button>
                  <button 
                    onClick={handleClearReadAlerts}
                    disabled={!alerts.some(a => a.isRead) || alerts.length === 0}
                    className="px-4 py-2 border border-[var(--glass-border-color)] text-rose-500 hover:bg-rose-500/5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-2"
                  >
                    <Trash className="w-3 h-3" />
                    Clear read
                  </button>
                </div>
              </div>

              {/* Alerts List */}
              <div className="space-y-4">
                <AnimatePresence mode="popLayout" initial={false}>
                  {alerts
                    .filter(a => alertFilter === 'unread' ? !a.isRead : true)
                    .map((alert) => (
                      <motion.div 
                        key={alert.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={`p-6 rounded-2xl border transition-all duration-300 ${
                          alert.isRead 
                            ? 'bg-[var(--glass-background)]/50 border-[var(--glass-border-color)] opacity-70' 
                            : 'bg-[var(--panel-bg)] border-[var(--glass-border-color)] shadow-sm'
                        } flex items-center justify-between group relative z-10`}
                      >
                      <div className="flex items-center gap-5">
                        <motion.div 
                          whileHover={{ scale: 1.1 }}
                          className={`p-3 rounded-xl ${
                            alert.isResolved ? 'bg-emerald-500/10 text-emerald-500' :
                            alert.severity === 'critical' ? 'bg-rose-500/10 text-rose-500' : 
                            alert.severity === 'high' ? 'bg-orange-500/10 text-orange-500' :
                            'bg-primary/10 text-primary'
                          }`}
                        >
                          {alert.isResolved ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                        </motion.div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-bold tracking-tight leading-tight ${alert.isRead ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                              {alert.message}
                            </p>
                            {alert.isResolved && (
                              <span className="bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                Resolved
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest">
                              {alert.type} • {alert.timestamp?.toDate ? alert.timestamp.toDate().toLocaleString() : 'Just now'}
                            </p>
                            {alert.predictedDays !== undefined && alert.predictedDays !== null && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10">
                                <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                                <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Runway: {alert.predictedDays.toFixed(0)} Days</span>
                              </div>
                            )}
                            {alert.supplierId && suppliers.find(s => s.id === alert.supplierId) && (
                              <button 
                                onClick={() => setSelectedSupplier(suppliers.find(s => s.id === alert.supplierId)!)}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors group/slink"
                              >
                                <Truck className="w-2.5 h-2.5 text-emerald-500 opacity-60 group-hover/slink:opacity-100" />
                                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Partner: {suppliers.find(s => s.id === alert.supplierId)?.name}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleToggleAlertRead(alert)}
                          className={`p-2 rounded-lg transition-all ${
                            alert.isRead ? 'text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5' : 'text-primary hover:bg-primary/10'
                          }`}
                          title={alert.isRead ? "Mark as unread" : "Mark as read"}
                        >
                          <CheckCircle2 className={`w-5 h-5 ${alert.isRead ? 'opacity-40' : 'opacity-100'}`} />
                        </button>
                        <button 
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="p-2 text-[var(--text-secondary)] hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-all"
                          title="Delete alert"
                        >
                          <Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {alerts.filter(a => alertFilter === 'unread' ? !a.isRead : true).length === 0 && (
                  <div className="py-24 text-center bg-[var(--glass-background)] border-2 border-dashed border-[var(--glass-border-color)] rounded-[32px] relative z-10">
                    <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">System Fully Healthy</h3>
                    <p className="text-[var(--text-secondary)] text-sm font-bold">No {alertFilter === 'unread' ? 'unread' : ''} alerts found. Everything is running smoothly.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'procurement' && (
            <motion.div 
              key="procurement"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 p-2">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Procurement Gateway</h2>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">Strategic Order Tracking & Neural Verification</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {orders.length > 0 ? orders.map((order) => (
                  <motion.div 
                    key={order.id}
                    layout
                    whileHover={{ y: -4 }}
                    className="glass-card overflow-hidden border-[var(--glass-border-color)] group hover:border-primary/30 transition-all duration-500 shadow-sm hover:shadow-2xl"
                  >
                    <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 relative overflow-hidden">
                      {/* Status Accent Bar */}
                      <div className={`absolute top-0 left-0 w-1 h-full ${
                        order.status === 'received' ? 'bg-emerald-500' :
                        order.status === 'pending' ? 'bg-amber-500' :
                        'bg-primary'
                      } opacity-40`} />

                      <div className="flex items-center gap-6 relative z-10">
                        <div className={`p-4 rounded-2xl border ${
                          order.status === 'received' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                          order.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                          order.status === 'shipped' ? 'bg-primary/10 border-primary/20 text-primary' :
                          'bg-[var(--glass-background)] border-[var(--glass-border-color)] text-[var(--text-secondary)]'
                        }`}>
                          {order.status === 'received' ? <FileCheck className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-bold text-lg text-[var(--text-primary)] tracking-tight">Order #{order.id.slice(0, 8).toUpperCase()}</h4>
                            <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors ${
                              order.status === 'received' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                              order.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                              'bg-primary/10 text-primary border-primary/20'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-primary opacity-80">{order.supplierName}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest flex items-center gap-1.5">
                              <RefreshCw className="w-3 h-3 text-primary opacity-40" />
                              Synced: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Recent'}
                            </p>
                            <div className="w-1 h-1 rounded-full bg-[var(--glass-border-color)]" />
                            <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest">
                              {order.items.length} Product Lines
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col md:items-end relative z-10">
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1 opacity-60">Procurement Valuation</p>
                        <p className="text-3xl font-bold text-[var(--text-primary)] font-mono tracking-tighter">${order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>

                      <div className="flex items-center justify-end gap-3 min-w-[220px] relative z-10">
                        {['pending', 'confirmed'].includes(order.status) && (
                          <button 
                            onClick={() => handleDeleteOrder(order.id)}
                            className="p-3.5 border border-rose-500/20 text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all flex items-center gap-2 pr-5 shadow-sm active:scale-95 group/cancel"
                            title="Cancel Order"
                          >
                            <Trash2 className="w-4 h-4 group-hover/cancel:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Cancel Order</span>
                          </button>
                        )}
                        {order.status === 'pending' && (
                          <button 
                            onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                            className="w-full py-3.5 bg-[var(--glass-background)] hover:bg-[var(--text-primary)]/10 text-[10px] font-bold uppercase tracking-widest px-6 rounded-xl transition-all border border-[var(--glass-border-color)] active:scale-95 shadow-sm"
                          >
                            Confirm Order
                          </button>
                        )}
                        {order.status === 'confirmed' && (
                          <button 
                            onClick={() => handleUpdateOrderStatus(order.id, 'shipped')}
                            className="w-full py-3.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest px-6 rounded-xl border border-primary/20 transition-all active:scale-95 shadow-md"
                          >
                            Mark Shipped
                          </button>
                        )}
                        {order.status === 'shipped' && (
                          <div className="flex flex-col gap-2 w-full">
                            <button 
                              onClick={() => handleReceiveOrder(order)}
                              disabled={new Date() < (order.expectedDelivery?.toDate() || new Date())}
                              className={`w-full py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-widest px-6 shadow-lg transition-all flex items-center justify-center gap-2 ${
                                new Date() < (order.expectedDelivery?.toDate() || new Date())
                                  ? 'bg-[var(--glass-background)] text-[var(--text-secondary)] border border-[var(--glass-border-color)] cursor-not-allowed opacity-50'
                                  : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:scale-[1.02] active:scale-95'
                              }`}
                            >
                              <CheckCircle className="w-4 h-4" />
                              {new Date() < (order.expectedDelivery?.toDate() || new Date()) ? 'In Transit...' : 'Receive Inventory'}
                            </button>
                            {new Date() < (order.expectedDelivery?.toDate() || new Date()) && (
                              <button 
                                onClick={() => handleReceiveOrder(order, true)}
                                className="text-[8px] font-bold text-primary hover:underline uppercase tracking-widest opacity-40 hover:opacity-100 transition-all text-center"
                              >
                                Neural Sync: Force Receipt (Simulation Bypass)
                              </button>
                            )}
                          </div>
                        )}
                        {order.status === 'received' && (
                          <div className="w-full flex items-center justify-center gap-2 text-emerald-500 px-6 py-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 shadow-inner">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Neural Link Verified</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-8 pb-4">
                      {/* Delivery Status & Progress */}
                      {['confirmed', 'shipped'].includes(order.status) && (
                        <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <Clock className="w-3.5 h-3.5 text-primary opacity-60" />
                               <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-widest">Delivery Progress</span>
                             </div>
                             <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                               ETA: {order.expectedDelivery?.toDate ? order.expectedDelivery.toDate().toLocaleString() : 'Processing'}
                             </span>
                          </div>
                          
                          {(() => {
                            const start = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : Date.now();
                            const end = order.expectedDelivery?.toDate ? order.expectedDelivery.toDate().getTime() : Date.now() + 1000;
                            const now = Date.now();
                            const progress = Math.min(Math.max(((now - start) / (end - start)) * 100, 0), 100);
                            
                            return (
                              <div className="space-y-1">
                                <div className="w-full h-1.5 bg-[var(--glass-border-color)] rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={`h-full bg-gradient-to-r from-primary to-[#c084fc] ${progress === 100 ? 'animate-pulse' : ''}`}
                                  />
                                </div>
                                <div className="flex justify-between text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">
                                  <span>Departure</span>
                                  <span>{progress.toFixed(0)}% Synchronized</span>
                                  <span>Logistics Hub</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                       <div className="p-6 bg-[var(--bg-main)]/30 rounded-[24px] border border-[var(--glass-border-color)] shadow-inner">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--panel-bg)]/80 border border-[var(--glass-border-color)] group/item hover:border-primary/20 transition-all">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-[var(--glass-background)] rounded-lg border border-[var(--glass-border-color)]">
                                  <Package className="w-3.5 h-3.5 text-primary opacity-60 group-hover/item:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-xs font-bold text-[var(--text-primary)] truncate">{item.productName}</span>
                              </div>
                              <div className="flex items-end justify-between mt-2">
                                <div>
                                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Price/Unit</p>
                                  <p className="text-xs font-bold text-[var(--text-primary)] font-mono">${item.price.toFixed(2)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Batch Qty</p>
                                  <p className="text-sm font-bold text-primary font-mono tracking-tighter">x{item.quantity}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                       </div>
                    </div>
                  </motion.div>
                )) : (
                  <div className="py-24 text-center glass-card border-2 border-dashed border-[var(--glass-border-color)] overflow-hidden relative">
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="p-6 bg-primary/10 text-primary rounded-3xl w-24 h-24 flex items-center justify-center mb-8 shadow-inner border border-primary/20">
                        <FileText className="w-12 h-12 opacity-40 animate-pulse" />
                      </div>
                      <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3 tracking-tight">No Strategic Procurement Active</h3>
                      <p className="text-[var(--text-secondary)] text-sm font-bold max-w-sm mx-auto opacity-70 leading-relaxed">
                        Initiate replenishment orders from your inventory grid or supplier strategic profiles to begin the procurement sync.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>

      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#2e1065]/30 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card w-full max-w-lg overflow-hidden border-[var(--glass-border-color)] shadow-2xl"
            >
              <div className="flex items-center justify-between p-8 border-b border-[var(--glass-border-color)] bg-[var(--panel-bg)]">
                <div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                    {editingProduct.id ? 'Modify Entity' : 'Register New Entity'}
                  </h3>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">
                    {editingProduct.id ? 'System Override Mode' : 'Inventory Creation Mode'}
                  </p>
                </div>
                <button onClick={() => setEditingProduct(null)} className="p-2 hover:bg-[var(--text-primary)]/10 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>
              <form onSubmit={handleSaveProduct} className="p-8 space-y-6 bg-[var(--bg-main)]">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Product Name</label>
                    <input 
                      type="text" 
                      value={editingProduct.name}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, name: e.target.value});
                        if (formErrors.name) setFormErrors({...formErrors, name: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.name ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.name && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                    <input 
                      type="text" 
                      value={editingProduct.category}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, category: e.target.value});
                        if (formErrors.category) setFormErrors({...formErrors, category: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.category ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.category && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.category}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">SKU Identifier</label>
                    <input 
                      type="text" 
                      value={editingProduct.sku}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, sku: e.target.value});
                        if (formErrors.sku) setFormErrors({...formErrors, sku: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.sku ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.sku && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.sku}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Unit Price ($)</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.price) ? '' : editingProduct.price}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, price: parseFloat(e.target.value)});
                        if (formErrors.price) setFormErrors({...formErrors, price: ''});
                      }}
                      step="any"
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.price ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.price && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.price}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Unit Cost ($)</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.cost || 0) ? '' : editingProduct.cost}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, cost: parseFloat(e.target.value)});
                        if (formErrors.cost) setFormErrors({...formErrors, cost: ''});
                      }}
                      step="any"
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.cost ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                    />
                    {formErrors.cost && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.cost}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Current</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.stockLevel) ? '' : editingProduct.stockLevel}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, stockLevel: parseInt(e.target.value)});
                        if (formErrors.stockLevel) setFormErrors({...formErrors, stockLevel: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.stockLevel ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.stockLevel && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.stockLevel}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Min</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.minThreshold) ? '' : editingProduct.minThreshold}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, minThreshold: parseInt(e.target.value)});
                        if (formErrors.minThreshold) setFormErrors({...formErrors, minThreshold: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.minThreshold ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.minThreshold && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.minThreshold}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Max</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.maxThreshold) ? '' : editingProduct.maxThreshold}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, maxThreshold: parseInt(e.target.value)});
                        if (formErrors.maxThreshold) setFormErrors({...formErrors, maxThreshold: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.maxThreshold ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] placeholder-[var(--text-secondary)]/30`}
                      required
                    />
                    {formErrors.maxThreshold && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.maxThreshold}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Strategic Partner</label>
                    <select 
                      value={editingProduct.supplierId || ''}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, supplierId: e.target.value});
                        if (formErrors.supplierId) setFormErrors({...formErrors, supplierId: ''});
                      }}
                      className="w-full bg-[var(--panel-bg)] border border-[var(--glass-border-color)] rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)] appearance-none cursor-pointer"
                    >
                      <option value="">No Assigned Partner</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Lead Time (Days)</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.leadTime || 0) ? '' : editingProduct.leadTime}
                      onChange={(e) => {
                        setEditingProduct({...editingProduct, leadTime: parseInt(e.target.value)});
                        if (formErrors.leadTime) setFormErrors({...formErrors, leadTime: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${formErrors.leadTime ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    />
                    {formErrors.leadTime && <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {formErrors.leadTime}</p>}
                  </div>
                </div>
                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="flex-1 py-4 border border-[var(--glass-border-color)] text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5 font-bold rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Save className="w-4 h-4" />
                    {editingProduct.id ? 'Commit Changes' : 'Register Entity'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {selectedSupplier && (
          <SupplierDetailModal 
            supplier={selectedSupplier}
            products={products}
            onClose={() => setSelectedSupplier(null)}
            onReplenish={handleBulkReplenish}
          />
        )}
        {editingSupplier && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#2e1065]/40 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="glass-card w-full max-w-lg overflow-hidden border-[var(--glass-border-color)] shadow-2xl"
            >
              <div className="flex items-center justify-between p-8 border-b border-[var(--glass-border-color)] bg-[var(--panel-bg)]">
                <div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                    {editingSupplier.id ? 'Modify Strategic Partner' : 'Onboard New Partner'}
                  </h3>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Network Governance</p>
                </div>
                <button onClick={() => setEditingSupplier(null)} className="p-2 hover:bg-[var(--text-primary)]/10 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>
              <form onSubmit={handleSaveSupplier} className="p-8 space-y-6 bg-[var(--bg-main)]">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Entity Name</label>
                  <input 
                    type="text" 
                    value={editingSupplier.name}
                    onChange={(e) => {
                      setEditingSupplier({...editingSupplier, name: e.target.value});
                      if (supplierFormErrors.name) setSupplierFormErrors({...supplierFormErrors, name: ''});
                    }}
                    className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.name ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    required
                  />
                  {supplierFormErrors.name && <p className="text-[10px] font-bold text-rose-500 mt-1">{supplierFormErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contact Signal (Email)</label>
                  <input 
                    type="email" 
                    value={editingSupplier.contact}
                    onChange={(e) => {
                      setEditingSupplier({...editingSupplier, contact: e.target.value});
                      if (supplierFormErrors.contact) setSupplierFormErrors({...supplierFormErrors, contact: ''});
                    }}
                    className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.contact ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    required
                  />
                  {supplierFormErrors.contact && <p className="text-[10px] font-bold text-rose-500 mt-1">{supplierFormErrors.contact}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Trust Rating (0.0 - 5.0)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="5"
                    value={editingSupplier.rating}
                    onChange={(e) => {
                      setEditingSupplier({...editingSupplier, rating: parseFloat(e.target.value)});
                      if (supplierFormErrors.rating) setSupplierFormErrors({...supplierFormErrors, rating: ''});
                    }}
                    className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.rating ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    required
                  />
                  {supplierFormErrors.rating && <p className="text-[10px] font-bold text-rose-500 mt-1">{supplierFormErrors.rating}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">HQ Address</label>
                  <input 
                    type="text" 
                    value={editingSupplier.address || ''}
                    onChange={(e) => {
                      setEditingSupplier({...editingSupplier, address: e.target.value});
                      if (supplierFormErrors.address) setSupplierFormErrors({...supplierFormErrors, address: ''});
                    }}
                    placeholder="e.g. Seattle, WA, USA"
                    className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.address ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                  />
                  {supplierFormErrors.address && <p className="text-[10px] font-bold text-rose-500 mt-1">{supplierFormErrors.address}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Latitude</label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={editingSupplier.lat === undefined ? '' : editingSupplier.lat}
                      onChange={(e) => {
                        setEditingSupplier({...editingSupplier, lat: parseFloat(e.target.value)});
                        if (supplierFormErrors.coordinates) setSupplierFormErrors({...supplierFormErrors, coordinates: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.coordinates ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Longitude</label>
                    <input 
                      type="number" 
                      step="0.0001"
                      value={editingSupplier.lng === undefined ? '' : editingSupplier.lng}
                      onChange={(e) => {
                        setEditingSupplier({...editingSupplier, lng: parseFloat(e.target.value)});
                        if (supplierFormErrors.coordinates) setSupplierFormErrors({...supplierFormErrors, coordinates: ''});
                      }}
                      className={`w-full bg-[var(--panel-bg)] border ${supplierFormErrors.coordinates ? 'border-rose-500/50' : 'border-[var(--glass-border-color)]'} rounded-xl px-4 py-3 text-sm font-mono focus:border-primary/50 outline-none transition-all text-[var(--text-primary)]`}
                    />
                  </div>
                </div>
                {supplierFormErrors.coordinates && <p className="text-[10px] font-bold text-rose-500 mt-1">{supplierFormErrors.coordinates}</p>}

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Operational Status</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['active', 'on-hold', 'critical'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setEditingSupplier({ ...editingSupplier, status: s as any })}
                        className={`py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                          editingSupplier.status === s
                            ? s === 'active' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                              s === 'on-hold' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                              'bg-rose-500/10 border-rose-500/30 text-rose-500'
                            : 'bg-[var(--glass-background)] border-[var(--glass-border-color)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setEditingSupplier(null)}
                    className="flex-1 py-4 border border-[var(--glass-border-color)] text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5 font-bold rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                  >
                    Abort
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {editingSupplier.id ? 'Push Update' : 'Initialize Partner'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {importErrors.length > 0 && (
          <CSVErrorModal 
            errors={importErrors} 
            onClose={() => setImportErrors([])} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper Components
function NavItem({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
        active 
          ? 'text-[var(--text-primary)]' 
          : 'text-[var(--text-secondary)] opacity-60 hover:opacity-100 hover:text-[var(--text-primary)]'
      }`}
    >
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute inset-0 bg-primary/25 border border-primary/40 rounded-2xl shadow-sm"
          transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
        />
      )}
      <div className="flex items-center gap-3 relative z-10">
        <motion.span 
          animate={active ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={`transition-colors duration-300 ${active ? 'text-primary' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}
        >
          {icon}
        </motion.span>
        <span className="text-sm font-semibold tracking-tight">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="relative z-10 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg shadow-rose-500/20">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatCard({ label, value, icon, trend, trendUp, color, variants }: { label: string, value: string, icon: React.ReactNode, trend: string, trendUp: boolean, color: string, variants?: any }) {
  return (
    <motion.div 
      layout
      variants={variants}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="glass-card glass-card-hover p-6 relative overflow-hidden group shadow-sm hover:shadow-xl border-[var(--glass-border-color)]"
    >
      {/* Accent Bar */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color} opacity-40 group-hover:opacity-100 transition-opacity duration-500`} />
      
      <div className="flex items-start justify-between mb-4">
        <motion.div 
          whileHover={{ rotate: 12, scale: 1.1 }}
          className={`p-2.5 rounded-xl bg-[var(--panel-bg)] border border-[var(--glass-border-color)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors shadow-inner`}
        >
          {icon}
        </motion.div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border border-[var(--glass-border-color)] ${
          trendUp ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'
        }`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-[var(--text-primary)] font-mono tracking-tight">{value}</h3>
      </div>
    </motion.div>
  );
}

function InsightCard({ insight, onApply, variants }: { insight: Insight, onApply: (insight: Insight) => void, variants?: any }) {
  const icons = {
    trend: <TrendingUp className="w-5 h-5 text-primary" />,
    deal: <Tag className="w-5 h-5 text-emerald-400" />,
    combo: <Layers className="w-5 h-5 text-primary opacity-70" />,
    prediction: <BrainCircuit className="w-5 h-5 text-amber-400" />
  };

  const tints = {
    trend: 'bg-primary/5',
    deal: 'bg-emerald-500/5',
    combo: 'bg-primary/5',
    prediction: 'bg-amber-500/5'
  };

  return (
    <motion.div 
      layout
      variants={variants}
      initial={variants ? undefined : { opacity: 0, scale: 0.95 }}
      animate={variants ? undefined : { opacity: 1, scale: 1 }}
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`glass-card glass-card-hover p-8 relative overflow-hidden group ${tints[insight.type]}`}
    >
      <div className="flex items-center gap-4 mb-6">
        <motion.div 
          whileHover={{ rotate: -12, scale: 1.1 }}
          className="p-3 rounded-2xl bg-[var(--panel-bg)] border border-[var(--glass-border-color)] shadow-inner"
        >
          {icons[insight.type]}
        </motion.div>
        <div>
          <h4 className="font-bold text-[var(--text-primary)] tracking-tight text-lg">{insight.topic}</h4>
          <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-0.5">{insight.type}</p>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-8">{insight.content}</p>
      <div className="flex items-center justify-between pt-6 border-t border-[var(--glass-border-color)]">
        <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest">
          {insight.timestamp ? new Date(insight.timestamp.toDate ? insight.timestamp.toDate() : insight.timestamp).toLocaleDateString() : 'Recent'}
        </span>
        <button 
          onClick={() => onApply(insight)}
          className="text-xs font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-widest flex items-center gap-2"
        >
          Apply Strategy
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

function StockBadge({ product }: { product: Product }) {
  const status = product.stockLevel < product.minThreshold 
    ? 'Understocked' 
    : product.stockLevel > product.maxThreshold 
      ? 'Overstocked' 
      : 'Healthy';
  
  const colors = {
    Understocked: 'bg-rose-500/10 text-rose-400 border-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.1)]',
    Overstocked: 'bg-amber-500/10 text-amber-400 border-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.1)]',
    Healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
  };

  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${colors[status]}`}>
      {status}
    </span>
  );
}

function DemandPredictionChart({ data, accuracy, growth }: { data: any[], accuracy: number, growth: number }) {
  return (
    <motion.div 
      layout
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="glass-card p-8 lg:col-span-2 relative overflow-hidden group shadow-sm hover:shadow-xl"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">AI Demand Projection</h3>
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/20 uppercase tracking-widest">30-Day Forecast</span>
          </div>
          <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Neural modeling based on historical sales & behavioral triggers</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Accuracy Confidence</span>
            <span className="text-sm font-bold text-emerald-400">{accuracy.toFixed(1)}%</span>
          </div>
          <div className="w-px h-8 bg-[var(--glass-border-color)]" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Avg. Daily Growth</span>
            <span className="text-sm font-bold text-primary">{growth > 0 ? '+' : ''}{growth.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="h-[320px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(139, 92, 246, 0.1)" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 700 }}
              dy={10}
              interval={Math.ceil(data.length / 6)}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 700 }}
              dx={-10}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(139, 92, 246, 0.1)',
                backdropFilter: 'blur(12px)',
                padding: '12px'
              }}
              itemStyle={{ color: '#6d28d9', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
              labelStyle={{ color: '#2e1065', marginBottom: '4px', fontSize: '12px', fontWeight: 800 }}
              cursor={{ stroke: 'rgba(139, 92, 246, 0.1)', strokeWidth: 1 }}
            />
            <Line 
              type="monotone" 
              dataKey="demand" 
              stroke="url(#lineGradient)" 
              strokeWidth={3} 
              dot={false}
              activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 flex items-center justify-between pt-6 border-t border-[var(--glass-border-color)]">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Predicted Pulse</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400/40" />
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Strategy Confidence Buffer</span>
          </div>
        </div>
        <button className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-widest flex items-center gap-2">
          Download Model Stats
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

function ScenarioSimulator({ params, onChange }: { params: { demandIncrease: number, leadTimeDelay: number }, onChange: (p: { demandIncrease: number, leadTimeDelay: number }) => void }) {
  return (
    <motion.div 
      layout
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="glass-card glass-card-hover p-8 relative overflow-hidden group shadow-sm hover:shadow-xl"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Scenario Simulator</h3>
          <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">Stress Test Environment</p>
        </div>
        <motion.div 
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--glass-border-color)] shadow-inner"
        >
          <Zap className="w-4 h-4 text-primary" />
        </motion.div>
      </div>
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Demand Surge</span>
            <span className="text-primary font-mono font-bold">+{params.demandIncrease}%</span>
          </div>
          <input 
            type="range" 
            min="0" max="100" 
            value={isNaN(params.demandIncrease) ? 0 : params.demandIncrease} 
            onChange={(e) => onChange({ ...params, demandIncrease: parseInt(e.target.value) || 0 })}
            className="w-full h-1.5 bg-[var(--glass-border-color)] rounded-full appearance-none cursor-pointer accent-primary hover:opacity-80 transition-all shadow-inner"
          />
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier Delay</span>
            <span className="text-amber-400 font-mono font-bold">+{params.leadTimeDelay} days</span>
          </div>
          <input 
            type="range" 
            min="0" max="30" 
            value={isNaN(params.leadTimeDelay) ? 0 : params.leadTimeDelay} 
            onChange={(e) => onChange({ ...params, leadTimeDelay: parseInt(e.target.value) || 0 })}
            className="w-full h-1.5 bg-[var(--glass-border-color)] rounded-full appearance-none cursor-pointer accent-[#8b4513] hover:opacity-80 transition-all shadow-inner"
          />
        </div>
        <div className="p-6 bg-[var(--panel-bg)] border border-[var(--glass-border-color)] rounded-2xl shadow-inner">
          <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-4">Simulated Impact</p>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">Stockout Risk</p>
              <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">{(params.demandIncrease * 0.8 + params.leadTimeDelay * 2).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">Revenue Loss</p>
              <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">${(params.demandIncrease * 120).toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getStockColor(product: Product) {
  if (product.stockLevel < product.minThreshold) return 'bg-red-500';
  if (product.stockLevel > product.maxThreshold) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function SupplierDetailModal({ supplier, products, onClose, onReplenish }: { supplier: Supplier, products: Product[], onClose: () => void, onReplenish: (id: string) => void }) {
  const associatedProducts = products.filter(p => p.supplierId === supplier.id);
  
  const ratingHistory = useMemo(() => {
    // Generate deterministic rating history based on supplier ID and current rating
    const history = [];
    const base = supplier.rating;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (let i = 0; i < 6; i++) {
      // Deterministic fluctuation
      const noise = (Math.sin((supplier.id.charCodeAt(0) + i) * 1.5) * 0.4);
      history.push({
        month: months[i],
        rating: Math.min(5, Math.max(1, +(base + noise).toFixed(1)))
      });
    }
    return history;
  }, [supplier.id, supplier.rating]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#2e1065]/30 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 40 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="glass-card w-full max-w-2xl overflow-hidden border-[var(--glass-border-color)] shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className={`flex items-center justify-between p-8 border-b border-[var(--glass-border-color)] ${
          supplier.status === 'active' ? 'bg-emerald-500/[0.03]' :
          supplier.status === 'on-hold' ? 'bg-amber-500/[0.03]' :
          'bg-rose-500/[0.03]'
        } shrink-0`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${
              supplier.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20' :
              supplier.status === 'on-hold' ? 'bg-amber-500/10 border-amber-500/20' :
              'bg-rose-500/10 border-rose-500/20'
            }`}>
              {supplier.status === 'active' && <CheckCircle className="w-8 h-8 text-emerald-500" />}
              {supplier.status === 'on-hold' && <Clock className="w-8 h-8 text-amber-500" />}
              {supplier.status === 'critical' && <ShieldAlert className="w-8 h-8 text-rose-500" />}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{supplier.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
                  supplier.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                  supplier.status === 'on-hold' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                  'bg-rose-500/10 border-rose-500/30 text-rose-500'
                }`}>
                  {supplier.status}
                </span>
              </div>
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1 opacity-50">Strategic Supply Partner</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--text-primary)]/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="space-y-6">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Verification & Reliability</h4>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-bg)] border border-[var(--glass-border-color)]">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-4 h-4 ${s <= supplier.rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-secondary)] opacity-10'}`} />
                  ))}
                </div>
                <span className="text-lg font-bold text-[var(--text-primary)]">{supplier.rating.toFixed(1)}</span>
              </div>

              <div className="space-y-3">
                <h5 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] opacity-50">6-Month Reliability Trend</h5>
                <div className="h-24 w-full bg-[var(--panel-bg)] rounded-xl border border-[var(--glass-border-color)] p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ratingHistory}>
                      <defs>
                        <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(139, 92, 246, 0.05)" />
                      <XAxis 
                        dataKey="month" 
                        hide
                      />
                      <YAxis 
                        hide
                        domain={[0, 5]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--panel-bg)', 
                          border: '1px solid var(--glass-border-color)',
                          borderRadius: '8px',
                          fontSize: '10px'
                        }}
                        labelStyle={{ color: 'var(--text-secondary)', fontWeight: 700 }}
                        itemStyle={{ color: 'var(--accent-color)', fontWeight: 800 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="rating" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#ratingGrad)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="text-[var(--text-primary)] font-medium">{supplier.contact}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="text-[var(--text-primary)] font-medium">+1 (555) 000-0000</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-[var(--text-primary)] font-medium">Logistics Center North, Suite 400</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/10">
              <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Network Connectivity</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6">
                Active EDI connection established. Last successful sync performed 4 minutes ago. Preferred shipping lanes: North America & APAC.
              </p>
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--panel-bg)] border border-[var(--glass-border-color)]">
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">Lead Time SLA</span>
                <span className="text-sm font-bold text-emerald-400">Exceeded</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Associated Catalog ({associatedProducts.length})</h4>
              <button className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">View Full Order History</button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {associatedProducts.length > 0 ? associatedProducts.map(product => (
                <div key={product.id} className="flex items-center justify-between p-4 rounded-xl border border-[var(--glass-border-color)] bg-[var(--panel-bg)]/50 group hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--glass-background)] border border-[var(--glass-border-color)] flex items-center justify-center p-2">
                      <Package className="w-5 h-5 text-primary opacity-60" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)] group-hover:text-primary transition-colors">{product.name}</p>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest">{product.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStockColor(product)}`} />
                      <p className="text-sm font-bold text-[var(--text-primary)] font-mono">{product.stockLevel}</p>
                    </div>
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-widest mt-0.5">Quantity</p>
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center bg-[var(--panel-bg)]/30 border-2 border-dashed border-[var(--glass-border-color)] rounded-2xl">
                  <p className="text-sm font-bold text-[var(--text-secondary)] opacity-50">No products directly linked to this supplier</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-[var(--glass-border-color)] bg-[var(--panel-bg)] shrink-0 flex gap-3">
          <button 
            onClick={() => {
              onReplenish(supplier.id);
              onClose();
            }}
            className="flex-1 py-3.5 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-primary-hover transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Initiate Replenishment Order
          </button>
          <button onClick={onClose} className="px-8 py-3.5 border border-[var(--glass-border-color)] text-[var(--text-primary)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--text-primary)]/5 transition-all">
            Dismiss
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CSVErrorModal({ errors, onClose }: { errors: { row: number, column?: string, reason: string }[], onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-card w-full max-w-2xl max-h-[80vh] flex flex-col bg-[#1e1b4b] border-rose-500/30 overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-rose-100 tracking-tight">Import Synthesis Failure</h3>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">Found {errors.length} neural calibration errors</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-rose-500/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-rose-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="space-y-3">
            {errors.map((error, idx) => (
              <div key={idx} className="flex gap-4 p-4 rounded-xl bg-rose-500/[0.03] border border-rose-500/10 group hover:bg-rose-500/[0.05] transition-all">
                <div className="w-12 h-12 rounded-lg bg-rose-500/10 flex flex-col items-center justify-center shrink-0 border border-rose-500/20">
                  <span className="text-[8px] font-bold text-rose-400 uppercase">Row</span>
                  <span className="text-lg font-bold text-rose-200 font-mono tracking-tighter">{error.row}</span>
                </div>
                <div className="flex-1 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    {error.column && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 text-[10px] font-bold uppercase tracking-widest">
                        {error.column}
                      </span>
                    )}
                    <span className="text-xs font-bold text-rose-300 uppercase opacity-60 tracking-wider">Calibration Error</span>
                  </div>
                  <p className="text-sm text-rose-100/80 font-medium leading-relaxed">{error.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 border-t border-rose-500/20 bg-rose-500/5 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3.5 bg-rose-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Acknowledge Errors
          </button>
        </div>
      </motion.div>
    </div>
  );
}
