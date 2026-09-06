import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Pencil, Trash2, MapPin, Search
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];

export default function MasterAlamatPage() {
  const [activeTab, setActiveTab] = useState("provinces");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");

  const [parents, setParents] = useState({
    provinces: [],
    regencies: [],
    districts: [],
  });

  // Modal State
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    status: "ACTIVE",
    province_id: "",
    regency_id: "",
    district_id: "",
    postal_code: "",
  });

  const fetchData = async (tab) => {
    setLoading(true);
    try {
      const [mainRes, provRes, regRes, distRes] = await Promise.all([
        api.get(`/masters/${tab}`),
        api.get("/masters/provinces"),
        api.get("/masters/regencies"),
        api.get("/masters/districts"),
      ]);
      setItems(mainRes.data.items || mainRes.data || []);
      setParents({
        provinces: provRes.data.items || provRes.data || [],
        regencies: regRes.data.items || regRes.data || [],
        districts: distRes.data.items || distRes.data || [],
      });
    } catch (e) {
      toast.error("Gagal mengambil data: " + errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
    setSearch("");
  }, [activeTab]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q))
    );
  }, [items, search]);

  const handleOpen = (item = null) => {
    setEditItem(item);
    if (item) {
      setForm({
        name: item.name || "",
        code: item.code || "",
        status: item.status || "ACTIVE",
        province_id: item.province_id || "",
        regency_id: item.regency_id || "",
        district_id: item.district_id || "",
        postal_code: item.postal_code || "",
      });
    } else {
      setForm({
        name: "",
        code: "",
        status: "ACTIVE",
        province_id: "",
        regency_id: "",
        district_id: "",
        postal_code: "",
      });
    }
    setOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nama wajib diisi.");
    if (activeTab === "regencies" && !form.province_id) return toast.error("Provinsi wajib dipilih.");
    if (activeTab === "districts" && !form.regency_id) return toast.error("Kabupaten/Kota wajib dipilih.");
    if (activeTab === "villages" && !form.district_id) return toast.error("Kecamatan wajib dipilih.");

    try {
      const payload = { ...form };
      if (editItem) {
        await api.put(`/masters/${activeTab}/${editItem._id}`, payload);
        toast.success("Berhasil memperbarui data.");
      } else {
        await api.post(`/masters/${activeTab}`, payload);
        toast.success("Berhasil menambahkan data.");
      }
      setOpen(false);
      fetchData(activeTab);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Hapus data ini secara permanen?")) return;
    try {
      await api.delete(`/masters/${activeTab}/${id}`);
      toast.success("Data berhasil dihapus.");
      fetchData(activeTab);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-navy flex items-center gap-2">
            <MapPin className="text-gold" size={24} />
            Master Alamat Manual
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Kelola data provinsi, kabupaten/kota, kecamatan, dan kelurahan/desa.
          </p>
        </div>
        <Button onClick={() => handleOpen()} className="bg-navy hover:bg-navy-light text-white font-bold">
          <Plus size={16} className="mr-2" /> Tambah Data
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden flex flex-col flex-1">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div className="p-2 border-b border-slate-100">
            <TabsList className="grid w-full grid-cols-4 bg-slate-50 p-1">
              <TabsTrigger value="provinces" className="font-bold data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm">Provinsi</TabsTrigger>
              <TabsTrigger value="regencies" className="font-bold data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm">Kabupaten/Kota</TabsTrigger>
              <TabsTrigger value="districts" className="font-bold data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm">Kecamatan</TabsTrigger>
              <TabsTrigger value="villages" className="font-bold data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm">Kelurahan/Desa</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                placeholder="Cari berdasarkan nama atau kode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto relative min-h-[300px]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                <Loader2 size={32} className="animate-spin text-gold" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <MapPin size={48} className="mb-4 opacity-20" />
                <p>Tidak ada data ditemukan.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="font-bold text-navy w-16">Kode</TableHead>
                    <TableHead className="font-bold text-navy">Nama</TableHead>
                    {activeTab === "regencies" && <TableHead className="font-bold text-navy">Provinsi</TableHead>}
                    {activeTab === "districts" && <TableHead className="font-bold text-navy">Kab/Kota</TableHead>}
                    {activeTab === "villages" && (
                      <>
                        <TableHead className="font-bold text-navy">Kecamatan</TableHead>
                        <TableHead className="font-bold text-navy w-32">Kode Pos</TableHead>
                      </>
                    )}
                    <TableHead className="font-bold text-navy w-32">Status</TableHead>
                    <TableHead className="font-bold text-navy text-right w-24">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item._id} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-slate-600">{item.code || "-"}</TableCell>
                      <TableCell className="font-bold text-navy">{item.name}</TableCell>
                      
                      {activeTab === "regencies" && (
                        <TableCell className="text-slate-600">
                          {parents.provinces.find((p) => p._id === item.province_id)?.name || "-"}
                        </TableCell>
                      )}
                      
                      {activeTab === "districts" && (
                        <TableCell className="text-slate-600">
                          {parents.regencies.find((r) => r._id === item.regency_id)?.name || "-"}
                        </TableCell>
                      )}
                      
                      {activeTab === "villages" && (
                        <>
                          <TableCell className="text-slate-600">
                            {parents.districts.find((d) => d._id === item.district_id)?.name || "-"}
                          </TableCell>
                          <TableCell className="text-slate-600">{item.postal_code || "-"}</TableCell>
                        </>
                      )}

                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpen(item)} className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item._id)} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-bold">
              {editItem ? "Edit Data" : "Tambah Data"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            
            {activeTab === "regencies" && (
              <div className="space-y-2">
                <Label>Provinsi</Label>
                <Select value={form.province_id} onValueChange={(v) => setForm({ ...form, province_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih Provinsi..." /></SelectTrigger>
                  <SelectContent>
                    {parents.provinces.map(p => (
                      <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {activeTab === "districts" && (
              <div className="space-y-2">
                <Label>Kabupaten / Kota</Label>
                <Select value={form.regency_id} onValueChange={(v) => setForm({ ...form, regency_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih Kabupaten/Kota..." /></SelectTrigger>
                  <SelectContent>
                    {parents.regencies.map(r => (
                      <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === "villages" && (
              <div className="space-y-2">
                <Label>Kecamatan</Label>
                <Select value={form.district_id} onValueChange={(v) => setForm({ ...form, district_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih Kecamatan..." /></SelectTrigger>
                  <SelectContent>
                    {parents.districts.map(d => (
                      <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Nama</Label>
              <Input 
                value={form.name} 
                onChange={(e) => setForm({ ...form, name: e.target.value })} 
                placeholder="Contoh: JAWA TIMUR"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode (Opsional)</Label>
                <Input 
                  value={form.code} 
                  onChange={(e) => setForm({ ...form, code: e.target.value })} 
                  placeholder="Contoh: 35"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeTab === "villages" && (
              <div className="space-y-2">
                <Label>Kode Pos (Opsional)</Label>
                <Input 
                  value={form.postal_code} 
                  onChange={(e) => setForm({ ...form, postal_code: e.target.value })} 
                  placeholder="Contoh: 61234"
                />
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-gold hover:bg-gold-light text-navy font-bold">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
