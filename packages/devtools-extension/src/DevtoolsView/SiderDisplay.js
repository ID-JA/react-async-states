import React from "react";
import { useSource } from "react-async-states";
import Layout from "antd/lib/layout";
import Input from "antd/lib/input";
import Select from "antd/lib/select";
import {
  currentState,
  journalSource,
  keysSource,
  updatesMeter
} from "./sources";
import { SideKey } from "./CurrentStateDisplay";

const initialSort = {
  by: "lastUpdated",
  direction: "desc",
};

const sortOptions = [
  {
    label: "Creation date asc",
    value: "uniqueId|asc",
    sort: {
      by: "uniqueId",
      direction: "asc",
    },
  },
  {
    label: "Creation date desc",
    value: "uniqueId|desc",
    sort: {
      by: "uniqueId",
      direction: "desc",
    },
  },
  {
    label: "Key asc",
    value: "key|asc",
    sort: {
      by: "key",
      direction: "asc",
    },
  },
  {
    label: "Key desc",
    value: "key|desc",
    sort: {
      by: "key",
      direction: "desc",
    },
  },
  {
    label: "Last updated asc",
    value: "lastUpdated|asc",
    sort: {
      by: "lastUpdated",
      direction: "asc",
    },
  },
  {
    label: "Last updated desc",
    value: "lastUpdated|desc",
    sort: {
      by: "lastUpdated",
      direction: "desc",
    },
  },
];

function getSortFunction(sort) {
  return function sortFn(a, b) {
    const {data: [uniqueId1, key1, timestamp1]} = a;
    const {data: [uniqueId2, key2, timestamp2]} = b;
    if (sort.by === "uniqueId") {
      return sort.direction === "asc" ? uniqueId1 - uniqueId2 : uniqueId2 - uniqueId1;
    }
    if (sort.by === "key") {
      return sort.direction === "asc" ? key1.localeCompare(key2) : key2.localeCompare(key1);
    }
    if (sort.by === "lastUpdated") {
      return sort.direction === "asc" ? timestamp1 - timestamp2 : timestamp2 - timestamp1;
    }
    return 0;
  }
}

const {Header, Content, Sider} = Layout;

const SiderDisplay = React.memo(function () {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState(initialSort);
  const {state: {data}} = useSource(keysSource);
  const {state: {data: lane}} = useSource(currentState);
  const {state: {data: meter}} = useSource(updatesMeter);

  const currentSort = `${sort.by}|${sort.direction}`;

  const entries = React.useMemo(() => {
    const sortFn = getSortFunction(sort);
    let keysAndUniqueIds = Object.entries(data);
    if (search) {
      keysAndUniqueIds = keysAndUniqueIds.filter(([, key]) => key?.includes(search));
    }

    let instancesGroupingMap = {};
    keysAndUniqueIds
      .forEach(([id, key]) => {
        let laneState = journalSource.getLaneSource(id).getState();
        let {parent} = laneState.data;

        if (parent.uniqueId) {
          if (!instancesGroupingMap[parent.uniqueId]) {
            instancesGroupingMap[parent.uniqueId] = {
              data: [parent.uniqueId, parent.key],
              children: [[id, key, laneState.timestamp]]
            };
          } else {
            instancesGroupingMap[parent.uniqueId].children.push([id, key, laneState.timestamp]);
          }
        } else {
          if (!instancesGroupingMap[id]) {
            instancesGroupingMap[id] = {
              data: [id, key, laneState.timestamp],
              children: []
            }
          }
        }
      })

    return Object.values(instancesGroupingMap).sort(sortFn);
  }, [data, sort, meter, search]);

  return (
    <Sider
      className='main-bg scroll-y-auto'
      style={{
        height: '100vh',
        overflow: 'auto',
        padding: '0px 8px',
        borderRight: '1px dashed #C3C3C3',
      }}
      width={250}
    >
      <Header className='main-bg' style={{
        zIndex: 1,
        height: 40,
        position: "fixed",
        padding: "0px 8px",
      }}>
        <div style={{
          height: 40,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div className="main-color">Sort by:</div>
          <Select size="small" className="sorter"
                  style={{marginLeft: 8, borderRadius: 20}}
                  value={currentSort}
                  options={sortOptions}
                  onChange={(_, option) => setSort(option.sort)}/>
        </div>
      </Header>
      <Content className="scroll-y-auto"
               style={{
                 top: 40,
                 height: 'calc(100vh - 45px)',
                 overflow: 'auto',
                 marginTop: 40
               }}>
        <div style={{display: "flex", flexDirection: "column"}}>
          <Input allowClear placeholder="search by key"
                 style={{borderRadius: 24}}
                 size="small" value={search}
                 onChange={e => setSearch(e.target.value)}/>
          <div style={{display: "flex", marginTop: 8, flexDirection: "column"}}>
            {entries.map(({data: [uniqueId, key], children}) => <SideKey
              key={uniqueId}
              uniqueId={uniqueId}
              asyncStateKey={key}
              isCurrent={lane === uniqueId}
              lanes={children}
            />)}
          </div>
        </div>
      </Content>
    </Sider>
  );
});
export default SiderDisplay;
