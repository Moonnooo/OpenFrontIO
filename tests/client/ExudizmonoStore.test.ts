import {beforeEach,afterEach,expect,it,vi} from "vitest";
import "../../src/client/Store";
import {StoreModal} from "../../src/client/Store";
beforeEach(()=>{document.body.innerHTML="";});afterEach(()=>vi.unstubAllGlobals());
it("shows own cosmetic categories and never starts payments or upstream catalogue fetches",async()=>{
 const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 const store=new StoreModal();document.body.append(store);store.open();store.refresh();await store.updateComplete;
 expect(store.textContent).toContain("Exudizmono Store");expect(store.textContent).toContain("Flags");expect(store.textContent).toContain("Crowns");
 expect(store.querySelector('button[disabled]')?.textContent).toContain("Checkout coming soon");
 expect(store.querySelectorAll('a[href*="openfront"]').length).toBe(0);expect(fetchMock).not.toHaveBeenCalled();
});
