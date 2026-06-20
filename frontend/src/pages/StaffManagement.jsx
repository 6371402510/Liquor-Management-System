import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  Pencil,
  X,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";

// Import API functions
import { getCompanies } from "../apiservices/companyApi";
import { getUsers, createUser, updateUser } from "../apiservices/staffApi";

export default function StaffManagement() {
  const navigate = useNavigate();

  // Create Form States
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "MANAGER",
    company_id: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // List States
  const [staffList, setStaffList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // ─── NEW: Edit Modal States ───
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "MANAGER",
    company_id: "",
    is_active: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Fetch companies & Staff list on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const compData = await getCompanies();
        setCompanies(compData);
        const userData = await getUsers();
        setStaffList(userData);
      } catch (err) {
        console.error(err.message || "Failed to fetch data");
      } finally {
        setListLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    setFormSuccess("");

    try {
      await createUser(formData);
      setFormSuccess(`${formData.role} account created successfully!`);

      // Refresh the list
      const userData = await getUsers();
      setStaffList(userData);

      // Reset form
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "MANAGER",
        company_id: "",
      });
      setTimeout(() => setFormSuccess(""), 3000);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // ─── NEW: Open Edit Modal ───
  const openEditModal = (staff) => {
    setEditingUser(staff);
    setEditForm({
      name: staff.name,
      email: staff.email,
      password: "", // Leave empty - only update if filled
      role: staff.role,
      company_id: staff.company_id || "",
      is_active: staff.is_active,
    });
    setEditError("");
    setEditSuccess("");
    setShowPassword(false);
  };

  // ─── NEW: Close Edit Modal ───
  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm({
      name: "",
      email: "",
      password: "",
      role: "MANAGER",
      company_id: "",
      is_active: true,
    });
    setEditError("");
    setEditSuccess("");
    setShowPassword(false);
  };

  // ─── NEW: Handle Edit Form Input ───
  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // ─── NEW: Handle Update User ───
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    setEditSuccess("");

    try {
      // Build payload - only include password if it's not empty
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        company_id: editForm.company_id ? parseInt(editForm.company_id) : null,
        is_active: editForm.is_active,
      };

      // Only include password if user typed something
      if (editForm.password.trim() !== "") {
        if (editForm.password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }
        payload.password = editForm.password;
      }

      const updatedUser = await updateUser(editingUser.id, payload);

      setEditSuccess("User updated successfully!");

      // Update the staff list with the returned user
      setStaffList((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );

      // Close modal after short delay
      setTimeout(() => {
        closeEditModal();
      }, 1000);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // ─── NEW: Quick Toggle Active Status ───
  const handleToggleActive = async (staff) => {
    try {
      const updatedUser = await updateUser(staff.id, {
        is_active: !staff.is_active,
      });
      setStaffList((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );
    } catch (err) {
      console.error("Failed to toggle status:", err.message);
    }
  };

  const getCompanyName = (compId) => {
    if (!compId) return "N/A";
    const company = companies.find((c) => c.id === compId);
    return company ? company.companyName || company.company_name : "N/A";
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin-dashboard")}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Staff Management
          </h1>
        </div>
      </div>

      <div className="p-4 grid lg:grid-cols-3 gap-6">
        {/* ─── LEFT: Create Form ─── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 sticky top-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UserPlus size={20} /> Create New Staff
            </h2>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 mb-4">
                <AlertCircle size={14} /> {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 mb-4">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Rahul Sharma"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="e.g. manager@store.com"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="text"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Min 6 characters"
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="input-field"
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="SALESMAN">Salesman</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Store
                  </label>
                  <select
                    name="company_id"
                    required
                    value={formData.company_id}
                    onChange={handleInputChange}
                    className="input-field"
                  >
                    <option value="">Select</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName || c.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="btn-primary w-full justify-center py-2.5 mt-2"
              >
                {formLoading && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                Create Account
              </button>
            </form>
          </div>
        </div>

        {/* ─── RIGHT: Staff List Table ─── */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Existing Staff Members
            </h2>

            {listLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : staffList.length === 0 ? (
              <p className="text-gray-400 text-center py-10">
                No staff members found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                      <th className="text-left py-3 px-2">Name</th>
                      <th className="text-left py-3 px-2">Email</th>
                      <th className="text-left py-3 px-2">Role</th>
                      <th className="text-left py-3 px-2">Assigned Store</th>
                      <th className="text-center py-3 px-2">Status</th>
                      <th className="text-center py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((staff) => (
                      <tr
                        key={staff.id}
                        className="border-b dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="py-3 px-2 font-medium">{staff.name}</td>
                        <td className="py-3 px-2 text-gray-500 dark:text-gray-400">
                          {staff.email}
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                              staff.role === "MANAGER"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {staff.role === "MANAGER" ? (
                              <ShieldCheck size={12} />
                            ) : (
                              <UserCheck size={12} />
                            )}
                            {staff.role}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          {getCompanyName(staff.company_id)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleToggleActive(staff)}
                            className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                              staff.is_active
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                            }`}
                            title="Click to toggle status"
                          >
                            {staff.is_active ? "Active" : "Disabled"}
                          </button>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => openEditModal(staff)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Edit staff member"
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── NEW: Edit Modal ─── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeEditModal}
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Pencil size={18} />
                Edit Staff Member
              </h3>
              <button
                onClick={closeEditModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUpdateUser} className="p-5 space-y-4">
              {/* Error/Success Messages */}
              {editError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                  <AlertCircle size={14} /> {editError}
                </div>
              )}
              {editSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-600 dark:text-emerald-400">
                  {editSuccess}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={editForm.name}
                  onChange={handleEditInputChange}
                  className="input-field"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={editForm.email}
                  onChange={handleEditInputChange}
                  className="input-field"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                  <span className="text-gray-400 font-normal ml-1">
                    (leave blank to keep current)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={editForm.password}
                    onChange={handleEditInputChange}
                    placeholder="Enter new password..."
                    className="input-field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {editForm.password && editForm.password.length < 6 && (
                  <p className="text-xs text-red-500 mt-1">
                    Password must be at least 6 characters
                  </p>
                )}
              </div>

              {/* Role & Store */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    value={editForm.role}
                    onChange={handleEditInputChange}
                    className="input-field"
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="SALESMAN">Salesman</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Store
                  </label>
                  <select
                    name="company_id"
                    value={editForm.company_id}
                    onChange={handleEditInputChange}
                    className="input-field"
                  >
                    <option value="">Select</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName || c.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active Status Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Account Status
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {editForm.is_active
                      ? "User can login and access the system"
                      : "User is blocked from logging in"}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={editForm.is_active}
                    onChange={handleEditInputChange}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="btn-primary flex-1 justify-center py-2.5"
                >
                  {editLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}